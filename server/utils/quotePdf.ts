import PDFDocument from 'pdfkit'
import enLocale from '../../shared/i18n/locales/en.json'
import deLocale from '../../shared/i18n/locales/de.json'
import frLocale from '../../shared/i18n/locales/fr.json'
import itLocale from '../../shared/i18n/locales/it.json'
import { readUpload } from './uploads'
import { safeHref } from './documentPdf'

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
  article_name: string
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
  const sender = db.prepare('SELECT * FROM sender WHERE id = 1').get() as
    | (Party & {
        logo_path: string | null
        phone: string | null
        email: string | null
        website: string | null
        mwst: string | null
      })
    | undefined
  if (!sender) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Complete your sender block in Billing before generating a quote PDF'
    })
  }
  const logo = await readUpload(sender.logo_path)
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(quote.customer_id) as Party
  const items = db
    .prepare(
      'SELECT article_name, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent FROM quote_items WHERE quote_id = ? ORDER BY position, id'
    )
    .all(id) as ItemRow[]
  const references = db
    .prepare('SELECT label, url FROM quote_references WHERE quote_id = ? ORDER BY sort_order, id')
    .all(id) as Array<{ label: string; url: string }>

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

  // --- Letterhead, consistent with the invoice PDF / preview ---
  // Logo alone, top-left; the sender address is the underlined return line above
  // the recipient. Falls back to the company name when no logo is set.
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

  // Meta block (left): title, then a label/value table. (Quotes have no "page"
  // line — there's no on-screen preview to mirror, unlike invoices.)
  const metaTop = 135
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(L.quote, 50, metaTop)
  const metaRow = (label: string, value: string, ry: number) => {
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666')
      .text(label, 50, ry, { width: 75, lineBreak: false })
    pdf.fillColor('#000').text(value, 130, ry, { width: 170, lineBreak: false })
  }
  let my = metaTop + 22
  metaRow(L.quoteNo, quote.number, my)
  my += 14
  if (customer.customer_number) {
    metaRow(L.customerNo, customer.customer_number, my)
    my += 14
  }
  metaRow(L.date, dateFmt(quote.issue_date), my)
  my += 14
  if (quote.valid_until) {
    metaRow(L.validUntil, dateFmt(quote.valid_until), my)
    my += 14
  }
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

  let y = Math.max(leftBottom, rightBottom) + 26
  if (quote.title) {
    pdf.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(quote.title, 50, y, {
      width: 495
    })
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

  for (const i of items) {
    const amount = lineNetRappen({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })
    const title = (i.article_name || '').trim()
    if (title) {
      // Article name (bold) carries the figures; the free description wraps
      // underneath in grey.
      pdf.font('Helvetica-Bold').fontSize(9).fillColor('#000')
      drawRow([title, String(i.quantity), i.unit, chf(i.unit_price_rappen), chf(amount)], y)
      y += 13
      if (i.description?.trim()) {
        pdf.font('Helvetica').fontSize(8.5).fillColor('#555')
        pdf.text(i.description, cols[0]!.x, y, { width: cols[0]!.w + cols[1]!.w })
        y = pdf.y + 6
        pdf.fillColor('#000')
      } else {
        y += 5
      }
    } else {
      pdf.font('Helvetica').fontSize(9).fillColor('#000')
      drawRow([i.description, String(i.quantity), i.unit, chf(i.unit_price_rappen), chf(amount)], y)
      y += 18
    }
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

  // Reference / example links.
  if (references.length) {
    y += 18
    pdf.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(L.referencesTitle, 50, y)
    y = pdf.y + 4
    for (const r of references) {
      const label = (r.label || '').trim()
      const url = (r.url || '').trim()
      // Only make http(s)/mailto URLs clickable; anything else prints as plain
      // text so a javascript:/data: URL can't end up as a live PDF link.
      const link = safeHref(url)
      pdf.font('Helvetica').fontSize(9)
      if (label) {
        pdf.fillColor('#000').text(`${label}: `, 50, y, { continued: true })
      } else {
        pdf.text('', 50, y, { continued: true })
      }
      pdf
        .fillColor(link ? '#3458d6' : '#000')
        .text(url, { link: link ?? undefined, underline: !!link })
      y = pdf.y + 3
    }
    pdf.fillColor('#000')
  }

  // Contact footer, centered near the page bottom (no QR-bill on quotes).
  const footerLine = [sender.phone, sender.email, sender.website, sender.mwst]
    .filter(Boolean)
    .join('   ·   ')
  if (footerLine) {
    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#888')
      .text(footerLine, 50, 780, { width: 495, align: 'center', lineBreak: false })
  }

  pdf.end()
  return done
}
