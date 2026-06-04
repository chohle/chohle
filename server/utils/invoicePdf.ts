import PDFDocument from 'pdfkit'
import { SwissQRBill } from 'swissqrbill/pdf'
import { buildReference } from './qrReference'
import { readUpload } from './uploads'
import enLocale from '../../i18n/locales/en.json'
import deLocale from '../../i18n/locales/de.json'
import frLocale from '../../i18n/locales/fr.json'
import itLocale from '../../i18n/locales/it.json'

interface InvoiceRow {
  customer_id: number
  number: string
  title: string
  issue_date: string
  due_date: string
}
interface ItemRow {
  description: string
  quantity: number
  unit: string
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}
interface Party {
  name: string
  contact_person: string | null
  customer_number: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string
  iban?: string | null
  language?: string
  vat_registered?: number
}

const catalogs: Record<string, { invoiceDoc: typeof enLocale.invoiceDoc }> = {
  en: enLocale,
  de: deLocale,
  fr: frLocale,
  it: itLocale
}
const qrLang: Record<string, 'DE' | 'FR' | 'IT' | 'EN'> = { de: 'DE', fr: 'FR', it: 'IT', en: 'EN' }

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function dateFmt(iso: string) {
  const [y, m, d] = iso.split('-')
  return d ? `${d}.${m}.${y}` : ''
}

// Builds the invoice PDF (in the customer's language) with the Swiss QR-bill.
export async function generateInvoicePdf(id: number): Promise<Buffer> {
  const db = useDb()
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as
    | InvoiceRow
    | undefined
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })

  const sender = db.prepare('SELECT * FROM sender WHERE id = 1').get() as Party & {
    iban: string
    logo_path: string | null
    phone: string | null
    email: string | null
    website: string | null
    mwst: string | null
  }
  const logo = await readUpload(sender.logo_path)
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(invoice.customer_id) as Party
  const items = db
    .prepare(
      'SELECT description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?'
    )
    .all(id) as ItemRow[]

  const lang = customer?.language ?? 'en'
  const L = (catalogs[lang] ?? enLocale).invoiceDoc
  const vat = !!sender.vat_registered
  const totals = computeInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })),
    vat
  )

  const iban = (sender?.iban ?? '').replace(/\s/g, '')
  // Shared with the reconciliation matcher so the reference printed here is the
  // exact one parseReference() reverses back to this invoice (qrReference.ts).
  const reference = buildReference(id, iban)

  const qrData: Record<string, unknown> = {
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
  if (totals.totalRappen > 0) qrData.amount = totals.totalRappen / 100
  if (customer?.name && customer.street && customer.zip && customer.city) {
    qrData.debtor = {
      name: customer.name,
      address: customer.street,
      zip: customer.zip,
      city: customer.city,
      country: customer.country || 'CH'
    }
  }

  const pdf = new PDFDocument({ size: 'A4', margin: 50 })
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(chunks))))

  // --- Letterhead, matching the on-screen preview (print.vue) ---
  // Logo alone, top-left (no address beneath it); the sender address appears as
  // the underlined return line above the recipient. Falls back to the company
  // name when no logo is set. A corrupt image is skipped so it never fails.
  pdf.fillColor('#000')
  let logoDrawn = false
  if (logo) {
    try {
      pdf.image(logo, 50, 50, { fit: [170, 40], valign: 'top' })
      logoDrawn = true
    } catch {
      // ignore — fall back to the text name below
    }
  }
  if (!logoDrawn) {
    pdf
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#000')
      .text(sender.name || 'chohle', 50, 54)
  }

  // Meta block (left): title + "Page 1 / 1", then a label/value table.
  const metaTop = 135
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(L.invoice, 50, metaTop)
  pdf
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#888')
    .text(L.page, 120, metaTop + 1)
  const metaRow = (label: string, value: string, ry: number) => {
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666')
      .text(label, 50, ry, { width: 75, lineBreak: false })
    pdf.fillColor('#000').text(value, 130, ry, { width: 170, lineBreak: false })
  }
  let my = metaTop + 22
  metaRow(L.invoiceNo, invoice.number, my)
  my += 14
  if (customer.customer_number) {
    metaRow(L.customerNo, customer.customer_number, my)
    my += 14
  }
  metaRow(L.date, dateFmt(invoice.issue_date), my)
  my += 14
  metaRow(L.payableUntil, dateFmt(invoice.due_date), my)
  my += 14
  const leftBottom = my

  // Address block (right): underlined sender return line, then the recipient.
  const returnLine = [
    sender.name,
    sender.street,
    [sender.zip, sender.city].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join(', ')
  if (returnLine) {
    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#000')
      .text(returnLine, 330, metaTop, { width: 215, underline: true })
  }
  const addrTop = returnLine ? pdf.y + 8 : metaTop
  pdf
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#000')
    .text(customer.name, 330, addrTop, { width: 215 })
  pdf.font('Helvetica').fontSize(9)
  if (customer.contact_person) pdf.text(customer.contact_person, 330, undefined, { width: 215 })
  pdf.text(customer.street ?? '', 330, undefined, { width: 215 })
  pdf.text([customer.zip, customer.city].filter(Boolean).join(' '), 330, undefined, { width: 215 })
  if (customer.country && customer.country !== 'CH')
    pdf.text(customer.country, 330, undefined, { width: 215 })
  const rightBottom = pdf.y

  // Subject, below the taller of the two columns.
  let y = Math.max(leftBottom, rightBottom) + 26
  if (invoice.title) {
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(invoice.title, 50, y, {
      width: 495
    })
    y = pdf.y + 14
  }

  // Line items
  const cols = [
    { x: 50, w: 250, align: 'left' as const },
    { x: 300, w: 50, align: 'right' as const },
    { x: 355, w: 60, align: 'left' as const },
    { x: 415, w: 60, align: 'right' as const },
    { x: 475, w: 70, align: 'right' as const }
  ]
  const drawRow = (cells: string[], rowY: number) =>
    cells.forEach((v, idx) => {
      const col = cols[idx]!
      pdf.text(v, col.x, rowY, { width: col.w, align: col.align, lineBreak: false })
    })

  pdf.fontSize(9).font('Helvetica-Bold')
  drawRow([L.description, L.quantity, L.unit, L.price, L.amount], y)
  y += 16
  pdf.moveTo(50, y).lineTo(545, y).lineWidth(0.5).strokeColor('#000').stroke()
  y += 6

  pdf.font('Helvetica')
  for (const i of items) {
    const amount = lineNetRappen({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })
    drawRow([i.description, String(i.quantity), i.unit, chf(i.unit_price_rappen), chf(amount)], y)
    y += 18
  }

  // Totals
  y += 6
  pdf.moveTo(330, y).lineTo(545, y).lineWidth(0.5).stroke()
  y += 8
  const totalRow = (label: string, value: string, bold = false) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    pdf.text(label, 330, y, { width: 130, align: 'left', lineBreak: false })
    pdf.text(`CHF ${value}`, 460, y, { width: 85, align: 'right', lineBreak: false })
    y += 16
  }
  if (vat) totalRow(L.sumInChf, chf(totals.nettoRappen))
  for (const r of totals.mwstByRate) {
    totalRow(L.vatLine.replace('{rate}', String(r.rate)), chf(r.mwstRappen))
  }
  totalRow(L.invoiceAmountChf, chf(totals.totalRappen), true)

  // Contact footer, centered just above the QR-bill (mirrors the preview).
  const footerLine = [sender.phone, sender.email, sender.website, sender.mwst]
    .filter(Boolean)
    .join('   ·   ')
  if (footerLine) {
    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#888')
      .text(footerLine, 50, 524, { width: 495, align: 'center', lineBreak: false })
  }

  // Swiss QR-bill, placed at the bottom of the page in the customer's language.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new SwissQRBill(qrData as any, { language: qrLang[lang] ?? 'DE' }).attachTo(pdf)

  pdf.end()
  return done
}
