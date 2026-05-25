import { SwissQRBill } from 'swissqrbill/svg'
import {
  calculateQRReferenceChecksum,
  calculateSCORReferenceChecksum,
  isIBANValid,
  isQRIBAN
} from 'swissqrbill/utils'

interface Party {
  name: string
  street: string | null
  zip: string | null
  city: string | null
  country: string
  iban?: string | null
}
interface ItemRow {
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const invoice = db.prepare('SELECT id, customer_id FROM invoices WHERE id = ?').get(id) as
    | { customer_id: number }
    | undefined
  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const sender = db.prepare('SELECT * FROM sender WHERE id = 1').get() as Party | undefined
  const iban = (sender?.iban ?? '').replace(/\s/g, '')
  if (!sender || !isIBANValid(iban)) {
    throw createError({ statusCode: 422, statusMessage: 'Set a valid IBAN in Billing to generate the QR-bill.' })
  }
  if (!sender.name || !sender.street || !sender.zip || !sender.city) {
    throw createError({ statusCode: 422, statusMessage: 'Complete your sender address in Billing.' })
  }

  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(invoice.customer_id) as Party | undefined

  const items = db
    .prepare('SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?')
    .all(id) as ItemRow[]
  const vat = !!(sender as { vat_registered?: number }).vat_registered
  const { totalRappen } = computeInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })),
    vat
  )

  // QR-IBAN mandates a QRR reference; a regular IBAN uses a SCOR reference.
  const reference = isQRIBAN(iban)
    ? (() => {
        const base = String(id).padStart(26, '0')
        return base + calculateQRReferenceChecksum(base)
      })()
    : `RF${calculateSCORReferenceChecksum(String(id))}${id}`

  const data: Record<string, unknown> = {
    currency: 'CHF',
    reference,
    creditor: {
      account: iban,
      name: sender.name,
      address: sender.street,
      zip: sender.zip,
      city: sender.city,
      country: sender.country || 'CH'
    }
  }
  if (totalRappen > 0) data.amount = totalRappen / 100
  if (customer?.name && customer.street && customer.zip && customer.city) {
    data.debtor = {
      name: customer.name,
      address: customer.street,
      zip: customer.zip,
      city: customer.city,
      country: customer.country || 'CH'
    }
  }

  let svg: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svg = new SwissQRBill(data as any).toString()
  } catch (e) {
    throw createError({
      statusCode: 422,
      statusMessage: `Cannot generate QR-bill: ${(e as Error).message}`
    })
  }

  setHeader(event, 'Content-Type', 'image/svg+xml')
  return svg
})
