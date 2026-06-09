// Renders the tax-year report (Erfolgsrechnung + MWST summary + expense journal
// + missing-receipt list) to a PDF, using the same pdfkit/letterhead style as
// the invoice PDF. Rendered in German — the language of Swiss tax filings and
// the Treuhänder handoff.
import PDFDocument from 'pdfkit'
import type { TaxReport } from './taxReport'

const PAGE = { width: 595.28, height: 841.89, margin: 50 }
const RIGHT = PAGE.width - PAGE.margin // 545
const BOTTOM = PAGE.height - PAGE.margin // ~792

/** Format Rappen as a Swiss-formatted CHF amount (e.g. 1'296.00). */
function chf(rappen: number): string {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
/** Format an ISO date (YYYY-MM-DD) as Swiss dd.mm.yyyy. */
function dateFmt(iso: string): string {
  const [y, m, d] = (iso || '').split('-')
  return d ? `${d}.${m}.${y}` : iso
}

/** Render the tax report to a PDF buffer. `logo` is the sender logo, if any. */
export function renderTaxReportPdf(report: TaxReport, logo: Buffer | null): Promise<Buffer> {
  const pdf = new PDFDocument({ size: 'A4', margin: PAGE.margin })
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })

  // A right-aligned money cell at the current line.
  const moneyRow = (label: string, rappen: number, bold = false) => {
    pdf
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor('#000')
    pdf.text(label, PAGE.margin, pdf.y, { continued: false })
    pdf.text(`CHF ${chf(rappen)}`, PAGE.margin, pdf.y - 12, {
      width: RIGHT - PAGE.margin,
      align: 'right'
    })
    pdf.moveDown(0.2)
  }
  const heading = (text: string) => {
    if (pdf.y > BOTTOM - 80) pdf.addPage()
    pdf.moveDown(0.6)
    pdf.font('Helvetica-Bold').fontSize(13).fillColor('#111').text(text, PAGE.margin, pdf.y)
    pdf.moveDown(0.3)
  }
  const rule = () => {
    pdf.moveTo(PAGE.margin, pdf.y).lineTo(RIGHT, pdf.y).lineWidth(0.5).strokeColor('#ddd').stroke()
    pdf.moveDown(0.2)
  }

  // --- Letterhead ---
  let logoDrawn = false
  if (logo) {
    try {
      pdf.image(logo, PAGE.margin, 50, { fit: [170, 40], valign: 'top' })
      logoDrawn = true
    } catch {
      /* fall back to the name */
    }
  }
  if (!logoDrawn) {
    pdf
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111')
      .text(report.sender.name, PAGE.margin, 54)
  }

  pdf.y = 110
  pdf
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#111')
    .text(`Steuerexport ${report.year}`, PAGE.margin, pdf.y)
  pdf.moveDown(0.2)
  const addr = [
    report.sender.street,
    [report.sender.zip, report.sender.city].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join(', ')
  pdf.font('Helvetica').fontSize(9).fillColor('#555')
  if (addr) pdf.text(addr, PAGE.margin, pdf.y)
  if (report.sender.mwst) pdf.text(`MWST-Nr. ${report.sender.mwst}`, PAGE.margin, pdf.y)
  pdf.moveDown(0.4)

  // --- Erfolgsrechnung ---
  heading('Erfolgsrechnung')
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#444').text('Ertrag', PAGE.margin, pdf.y)
  pdf.moveDown(0.2)
  moneyRow('Honorar / Rechnungen', report.income.invoiceRappen)
  moneyRow('Lohn', report.income.salaryRappen)
  rule()
  moneyRow('Total Ertrag', report.income.totalRappen, true)

  pdf.moveDown(0.4)
  pdf.font('Helvetica-Bold').fontSize(10).fillColor('#444').text('Aufwand', PAGE.margin, pdf.y)
  pdf.moveDown(0.2)
  if (report.expenses.byCategory.length === 0) {
    pdf
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#777')
      .text('Keine Aufwände erfasst.', PAGE.margin, pdf.y)
    pdf.moveDown(0.2)
  }
  for (const cat of report.expenses.byCategory) moneyRow(cat.name, cat.totalRappen)
  rule()
  moneyRow('Total Aufwand', report.expenses.totalRappen, true)

  pdf.moveDown(0.3)
  rule()
  moneyRow(report.netRappen >= 0 ? 'Reingewinn' : 'Reinverlust', report.netRappen, true)

  // --- MWST summary (only when registered) ---
  if (report.vat.registered) {
    heading('MWST-Zusammenfassung')
    for (const r of report.vat.outputByRate) moneyRow(`Umsatzsteuer ${r.rate}%`, r.vatRappen)
    moneyRow('Umsatzsteuer total', report.vat.outputRappen, true)
    moneyRow('Vorsteuer (aus Aufwand)', report.vat.inputRappen)
    rule()
    moneyRow('Saldo MWST', report.vat.netVatRappen, true)
    pdf.font('Helvetica-Oblique').fontSize(8).fillColor('#888')
    pdf.text(
      'Vorsteuer aus den bei den Aufwänden erfassten MWST-Sätzen; die Belege liegen diesem Export bei.',
      PAGE.margin,
      pdf.y + 4,
      { width: RIGHT - PAGE.margin }
    )
    pdf.moveDown(0.4)
  }

  // --- Expense journal ---
  heading('Aufwandjournal')
  const cols = {
    nr: PAGE.margin,
    date: 80,
    vendor: 130,
    cat: 290,
    amount: 400,
    vat: 470,
    beleg: 510
  }
  const headerRow = () => {
    pdf.font('Helvetica-Bold').fontSize(8).fillColor('#444')
    const y = pdf.y
    pdf.text('Nr', cols.nr, y)
    pdf.text('Datum', cols.date, y)
    pdf.text('Lieferant', cols.vendor, y)
    pdf.text('Kategorie', cols.cat, y)
    pdf.text('Betrag', cols.amount, y, { width: 60, align: 'right' })
    pdf.text('MWST', cols.vat, y, { width: 35, align: 'right' })
    pdf.text('Beleg', cols.beleg, y)
    pdf.moveDown(0.2)
    rule()
  }
  headerRow()
  pdf.font('Helvetica').fontSize(8).fillColor('#000')
  report.expenses.journal.forEach((row, i) => {
    if (pdf.y > BOTTOM - 24) {
      pdf.addPage()
      headerRow()
      pdf.font('Helvetica').fontSize(8).fillColor('#000')
    }
    const y = pdf.y
    const nr = String(i + 1).padStart(4, '0')
    pdf.text(nr, cols.nr, y)
    pdf.text(dateFmt(row.date), cols.date, y)
    pdf.text((row.vendor || row.title).slice(0, 28), cols.vendor, y, { width: 155, ellipsis: true })
    pdf.text(row.category.slice(0, 20), cols.cat, y, { width: 105, ellipsis: true })
    pdf.text(chf(row.grossRappen), cols.amount, y, { width: 60, align: 'right' })
    pdf.text(row.vatRate ? `${row.vatRate}%` : '', cols.vat, y, { width: 35, align: 'right' })
    pdf
      .fillColor(row.attachments.length ? '#000' : '#c0392b')
      .text(row.attachments.length ? nr : 'fehlt', cols.beleg, y)
      .fillColor('#000')
    pdf.moveDown(0.35)
  })

  // --- Missing receipts ---
  if (report.missingReceipts.length) {
    heading('Fehlende Belege')
    pdf.font('Helvetica').fontSize(9).fillColor('#c0392b')
    for (const m of report.missingReceipts) {
      if (pdf.y > BOTTOM - 16) pdf.addPage()
      pdf.text(
        `${dateFmt(m.date)}  ${(m.vendor || m.title).slice(0, 40)}  CHF ${chf(m.grossRappen)}`,
        PAGE.margin,
        pdf.y
      )
      pdf.moveDown(0.15)
    }
  }

  // --- Footer note ---
  pdf.moveDown(0.6)
  pdf.font('Helvetica-Oblique').fontSize(8).fillColor('#888')
  pdf.text(
    'Alle Beträge in CHF inkl. MWST. Belege siehe Ordner "belege" in diesem Export.',
    PAGE.margin,
    pdf.y,
    {
      width: RIGHT - PAGE.margin
    }
  )

  pdf.end()
  return done
}
