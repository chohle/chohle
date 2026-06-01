import PDFDocument from 'pdfkit'
import enLocale from '../../i18n/locales/en.json'
import deLocale from '../../i18n/locales/de.json'
import frLocale from '../../i18n/locales/fr.json'
import itLocale from '../../i18n/locales/it.json'

// Quote (Offerte / Devis / Offerta) PDF. Near twin of invoicePdf.ts
// minus the Swiss QR-bill: quotes aren't payment instruments, so the
// QR slip belongs only on accepted-then-converted invoices. Header
// localises to "Offerte" / "Devis" / "Offerta" / "Quote" and the
// "payable until" line becomes "valid until" when the quote has one.

interface QuoteRow {
  customer_id: number
  number: string
  title: string
  issue_date: string
  valid_until: string | null
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
  language?: string
  vat_registered?: number
}

const catalogs: Record<string, { quoteDoc: typeof enLocale.quoteDoc }> = {
  en: enLocale,
  de: deLocale,
  fr: frLocale,
  it: itLocale
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function dateFmt(iso: string | null) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d ? `${d}.${m}.${y}` : ''
}

export async function generateQuotePdf(id: number): Promise<Buffer> {
  const db = useDb()
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as QuoteRow | undefined
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })

  // sender is a single-row config table. If the user hasn't visited
  // /api/sender yet, the row may not exist and we'd crash on access.
  // customer is guaranteed to exist because quotes.customer_id is a
  // NOT NULL FK with ON DELETE CASCADE, so it follows the quote.
  const sender = db.prepare('SELECT * FROM sender WHERE id = 1').get() as Party | undefined
  if (!sender) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Complete your sender block in Billing before generating a quote PDF'
    })
  }
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(quote.customer_id) as Party
  const items = db
    .prepare(
      'SELECT description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent FROM quote_items WHERE quote_id = ? ORDER BY position, id'
    )
    .all(id) as ItemRow[]

  const lang = customer?.language ?? 'en'
  const L = (catalogs[lang] ?? enLocale).quoteDoc
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

  const pdf = new PDFDocument({ size: 'A4', margin: 50 })
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(chunks))))

  pdf
    .fillColor('#000')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(sender.name || 'chohle', 50, 50)
  pdf
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555')
    .text(
      [sender.street, [sender.zip, sender.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', '),
      50
    )

  pdf
    .fillColor('#000')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(customer.name, 330, 120, { width: 215 })
  pdf.font('Helvetica')
  if (customer.contact_person) pdf.text(customer.contact_person, 330, undefined, { width: 215 })
  pdf.text(customer.street ?? '', 330, undefined, { width: 215 })
  pdf.text([customer.zip, customer.city].filter(Boolean).join(' '), 330, undefined, { width: 215 })
  if (customer.country && customer.country !== 'CH')
    pdf.text(customer.country, 330, undefined, { width: 215 })

  pdf.font('Helvetica-Bold').fontSize(13).text(L.quote, 50, 120)
  pdf.font('Helvetica').fontSize(9).fillColor('#000')
  pdf.text(`${L.quoteNo} ${quote.number}`, 50, 145)
  if (customer.customer_number) pdf.text(`${L.customerNo} ${customer.customer_number}`, 50)
  pdf.text(`${L.date} ${dateFmt(quote.issue_date)}`, 50)
  if (quote.valid_until) pdf.text(`${L.validUntil} ${dateFmt(quote.valid_until)}`, 50)

  let y = 215
  if (quote.title) {
    pdf.font('Helvetica-Bold').fontSize(11).text(quote.title, 50, y, { width: 495 })
    y = pdf.y + 14
  }

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
  totalRow(L.quoteAmountChf, chf(totals.totalRappen), true)

  pdf.end()
  return done
}
