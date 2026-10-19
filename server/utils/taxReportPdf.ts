// Renders the tax-year report (Erfolgsrechnung + MWST summary + expense journal
// grouped by month + waived receipts) to a PDF, using the same pdfkit/letterhead
// style as the invoice PDF. Rendered in German — the language of Swiss tax
// filings and the Treuhänder handoff. Every page carries a running header
// (from page 2) and a footer with the generation date and "Seite n / N".
import { extname } from 'node:path'
import PDFDocument from 'pdfkit'
import type { TaxJournalRow, TaxReport } from './taxReport'

const PAGE = { width: 595.28, height: 841.89, left: 50, right: 50, top: 72, bottom: 64 }
const LEFT = PAGE.left
const RIGHT = PAGE.width - PAGE.right
const WIDTH = RIGHT - LEFT
const BOTTOM = PAGE.height - PAGE.bottom

const INK = '#111'
const MUTED = '#555'
const FAINT = '#999'
const RULE = '#ddd'
const RED = '#c0392b'

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

/** Format Rappen as a Swiss-formatted amount (e.g. 1'296.00), no currency. */
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
function todayCh(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** What the "Beleg" column says for a journal row. */
function receiptLabel(row: TaxJournalRow): { text: string; color: string } {
  if (row.attachments.length === 0) {
    return row.receiptWaived ? { text: 'kein Beleg', color: FAINT } : { text: 'fehlt', color: RED }
  }
  if (row.attachments.length > 1) return { text: `${row.attachments.length} Dateien`, color: INK }
  const a = row.attachments[0]!
  const ext = (extname(a.storedName) || extname(a.filename)).replace('.', '').toUpperCase()
  return { text: ext || 'Datei', color: INK }
}

/** Render the tax report to a PDF buffer. `logo` is the sender logo, if any. */
export function renderTaxReportPdf(
  report: TaxReport,
  logo: Buffer | null,
  generatedAt: Date = new Date()
): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
    bufferPages: true,
    info: { Title: `Steuerexport ${report.year}`, Author: report.sender.name }
  })
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })

  // --- helpers ---------------------------------------------------------------
  /** Start a new page unless `h` points still fit on this one. */
  const ensure = (h: number) => {
    if (pdf.y + h > BOTTOM) pdf.addPage()
  }
  const rule = (color = RULE) => {
    pdf.moveTo(LEFT, pdf.y).lineTo(RIGHT, pdf.y).lineWidth(0.5).strokeColor(color).stroke()
    pdf.y += 4
  }
  const heading = (text: string) => {
    ensure(90)
    pdf.y += 14
    pdf.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(text, LEFT, pdf.y)
    pdf.y += 6
  }
  const subheading = (text: string) => {
    ensure(40)
    pdf.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text(text, LEFT, pdf.y)
    pdf.y += 2
  }
  /** Column caption for money sections: one "CHF" instead of one per row. */
  const moneyHeader = (withShare = false) => {
    const y = pdf.y
    pdf.font('Helvetica').fontSize(8).fillColor(FAINT)
    if (withShare)
      pdf.text('Anteil', RIGHT - 150, y, { width: 50, align: 'right', lineBreak: false })
    pdf.text('CHF', RIGHT - 90, y, { width: 90, align: 'right', lineBreak: false })
    pdf.y = y + 11
    rule()
  }
  /** label ........ [share] amount — amounts right-aligned, no currency prefix. */
  const moneyRow = (
    label: string,
    rappen: number,
    opts: { bold?: boolean; share?: number } = {}
  ) => {
    ensure(16)
    const y = pdf.y
    pdf
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor(INK)
      .text(label, LEFT, y, { width: WIDTH - 160, lineBreak: false, ellipsis: true })
    if (opts.share !== undefined) {
      pdf
        .font('Helvetica')
        .fillColor(FAINT)
        .text(`${Math.round(opts.share * 100)}%`, RIGHT - 150, y, {
          width: 50,
          align: 'right',
          lineBreak: false
        })
    }
    pdf
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(INK)
      .text(chf(rappen), RIGHT - 90, y, { width: 90, align: 'right', lineBreak: false })
    pdf.y = y + 15
  }
  const note = (text: string) => {
    ensure(24)
    pdf
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(FAINT)
      .text(text, LEFT, pdf.y + 2, { width: WIDTH })
    pdf.y += 4
  }

  // --- Letterhead (first page only) -------------------------------------------
  let logoDrawn = false
  if (logo) {
    try {
      pdf.image(logo, LEFT, 50, { fit: [170, 40] })
      logoDrawn = true
    } catch {
      /* fall back to the name */
    }
  }
  if (!logoDrawn) {
    pdf.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(report.sender.name, LEFT, 54)
  }

  // --- Title block ---------------------------------------------------------------
  pdf.y = 108
  pdf
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(INK)
    .text(`Steuerexport ${report.year}`, LEFT, pdf.y)
  pdf.y += 4
  const addr = [
    report.sender.street,
    [report.sender.zip, report.sender.city].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join(', ')
  pdf.font('Helvetica').fontSize(9).fillColor(MUTED)
  pdf.text(`Geschäftsjahr 01.01.${report.year} – 31.12.${report.year}`, LEFT, pdf.y)
  if (addr) pdf.text(addr, LEFT, pdf.y)
  if (report.sender.mwst) pdf.text(`MWST-Nr. ${report.sender.mwst}`, LEFT, pdf.y)
  pdf.text(`Erstellt am ${todayCh(generatedAt)}`, LEFT, pdf.y)

  // Receipt coverage at a glance, so the Treuhänder knows what to expect.
  const journal = report.expenses.journal
  const receiptFiles = journal.reduce((n, r) => n + r.attachments.length, 0)
  const summary = [
    `${journal.length} Buchungen`,
    `${receiptFiles} ${receiptFiles === 1 ? 'Beleg' : 'Belege'}`
  ]
  if (report.missingReceipts.length) summary.push(`${report.missingReceipts.length} fehlend`)
  if (report.waivedReceipts.length)
    summary.push(`${report.waivedReceipts.length} ohne Beleg (vermerkt)`)
  pdf.y += 8
  pdf.font('Helvetica').fontSize(9).fillColor(INK).text(summary.join('  ·  '), LEFT, pdf.y)
  pdf.y += 4

  // --- Erfolgsrechnung -----------------------------------------------------------
  heading('Erfolgsrechnung')
  subheading('Ertrag')
  moneyHeader()
  if (!report.income.invoiceRappen && !report.income.salaryRappen) {
    pdf.font('Helvetica').fontSize(10).fillColor(FAINT).text('Keine Erträge erfasst.', LEFT, pdf.y)
    pdf.y += 15
  }
  if (report.income.invoiceRappen) moneyRow('Honorar / Rechnungen', report.income.invoiceRappen)
  if (report.income.salaryRappen) moneyRow('Lohn', report.income.salaryRappen)
  rule()
  moneyRow('Total Ertrag', report.income.totalRappen, { bold: true })

  pdf.y += 6
  subheading('Aufwand')
  moneyHeader(true)
  if (report.expenses.byCategory.length === 0) {
    pdf.font('Helvetica').fontSize(10).fillColor(FAINT).text('Keine Aufwände erfasst.', LEFT, pdf.y)
    pdf.y += 15
  }
  for (const cat of report.expenses.byCategory) {
    moneyRow(cat.name, cat.totalRappen, {
      share: report.expenses.totalRappen ? cat.totalRappen / report.expenses.totalRappen : 0
    })
  }
  rule()
  moneyRow('Total Aufwand', report.expenses.totalRappen, { bold: true })

  pdf.y += 8
  rule(INK)
  moneyRow(report.netRappen >= 0 ? 'Reingewinn' : 'Reinverlust', report.netRappen, { bold: true })

  // --- MWST summary (only when registered) -----------------------------------------
  if (report.vat.registered) {
    heading('MWST-Zusammenfassung')
    if (!report.vat.outputRappen && !report.vat.inputRappen) {
      pdf
        .font('Helvetica')
        .fontSize(10)
        .fillColor(FAINT)
        .text(`Keine MWST-relevanten Buchungen ${report.year}.`, LEFT, pdf.y)
      pdf.y += 15
    } else {
      moneyHeader()
      for (const r of report.vat.outputByRate) moneyRow(`Umsatzsteuer ${r.rate}%`, r.vatRappen)
      moneyRow('Umsatzsteuer total', report.vat.outputRappen, { bold: true })
      moneyRow('Vorsteuer (aus Aufwand)', report.vat.inputRappen)
      rule()
      moneyRow('Saldo MWST', report.vat.netVatRappen, { bold: true })
      note(
        'Vorsteuer aus den bei den Aufwänden erfassten MWST-Sätzen; die Belege liegen diesem Export bei.'
      )
    }
  }

  // --- Expense journal, grouped by month ---------------------------------------------
  heading('Aufwandjournal')
  const withVat = report.vat.registered
  // Column x positions; money columns are given by their right edge.
  const col = withVat
    ? { nr: LEFT, date: 78, vendor: 124, cat: 272, gross: 418, rate: 452, vst: 500, beleg: 508 }
    : { nr: LEFT, date: 78, vendor: 124, cat: 290, gross: 440, rate: 478, vst: 0, beleg: 488 }
  const vendorW = col.cat - col.vendor - 8
  const catW = (withVat ? col.gross - 62 : col.gross - 62) - col.cat - 6
  const ROW = 12

  const headerRow = () => {
    const y = pdf.y
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    pdf.text('Nr', col.nr, y, { lineBreak: false })
    pdf.text('Datum', col.date, y, { lineBreak: false })
    pdf.text('Lieferant', col.vendor, y, { lineBreak: false })
    pdf.text('Kategorie', col.cat, y, { lineBreak: false })
    pdf.text('Brutto', col.gross - 60, y, { width: 60, align: 'right', lineBreak: false })
    pdf.text('MWST', col.rate - 32, y, { width: 32, align: 'right', lineBreak: false })
    if (withVat)
      pdf.text('Vorsteuer', col.vst - 46, y, { width: 46, align: 'right', lineBreak: false })
    pdf.text('Beleg', col.beleg, y, { lineBreak: false })
    pdf.y = y + ROW
    rule()
  }
  const journalRow = (row: TaxJournalRow, nr: string) => {
    if (pdf.y + ROW > BOTTOM) {
      pdf.addPage()
      headerRow()
    }
    const y = pdf.y
    pdf.font('Helvetica').fontSize(8).fillColor(INK)
    pdf.text(nr, col.nr, y, { lineBreak: false })
    pdf.text(dateFmt(row.date), col.date, y, { lineBreak: false })
    pdf.text(row.vendor || row.title, col.vendor, y, {
      width: vendorW,
      lineBreak: false,
      ellipsis: true
    })
    pdf.text(row.category, col.cat, y, { width: catW, lineBreak: false, ellipsis: true })
    pdf.text(chf(row.grossRappen), col.gross - 60, y, {
      width: 60,
      align: 'right',
      lineBreak: false
    })
    pdf.text(row.vatRate ? `${row.vatRate}%` : '', col.rate - 32, y, {
      width: 32,
      align: 'right',
      lineBreak: false
    })
    if (withVat) {
      pdf.text(row.inputVatRappen ? chf(row.inputVatRappen) : '', col.vst - 46, y, {
        width: 46,
        align: 'right',
        lineBreak: false
      })
    }
    const b = receiptLabel(row)
    pdf.fillColor(b.color).text(b.text, col.beleg, y, { lineBreak: false }).fillColor(INK)
    pdf.y = y + ROW
  }
  const monthRow = (label: string, count: number, gross: number) => {
    if (pdf.y + ROW * 3 > BOTTOM) {
      pdf.addPage()
      headerRow()
    }
    const y = pdf.y + 3
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    pdf.text(`${label}  ·  ${count} ${count === 1 ? 'Buchung' : 'Buchungen'}`, col.nr, y, {
      lineBreak: false
    })
    pdf
      .font('Helvetica')
      .text(chf(gross), col.gross - 60, y, { width: 60, align: 'right', lineBreak: false })
    pdf.y = y + ROW
  }

  if (journal.length === 0) {
    pdf.font('Helvetica').fontSize(10).fillColor(FAINT).text('Keine Aufwände erfasst.', LEFT, pdf.y)
    pdf.y += 15
  } else {
    headerRow()
    // Group by month, keeping the global numbering (it matches the receipt files).
    const groups = new Map<string, { rows: { row: TaxJournalRow; nr: string }[]; gross: number }>()
    journal.forEach((row, i) => {
      const key = row.date.slice(0, 7)
      const g = groups.get(key) ?? { rows: [], gross: 0 }
      g.rows.push({ row, nr: String(i + 1).padStart(4, '0') })
      g.gross += row.grossRappen
      groups.set(key, g)
    })
    for (const [month, g] of groups) {
      monthRow(monthLabel(`${month}-01`), g.rows.length, g.gross)
      for (const { row, nr } of g.rows) journalRow(row, nr)
    }
    // Total row.
    ensure(ROW * 2)
    pdf.y += 2
    rule()
    const y = pdf.y
    pdf.font('Helvetica-Bold').fontSize(8).fillColor(INK)
    pdf.text(`Total Aufwand ${report.year}`, col.nr, y, { lineBreak: false })
    pdf.text(chf(report.expenses.totalRappen), col.gross - 60, y, {
      width: 60,
      align: 'right',
      lineBreak: false
    })
    if (withVat) {
      pdf.text(chf(report.vat.inputRappen), col.vst - 46, y, {
        width: 46,
        align: 'right',
        lineBreak: false
      })
    }
    pdf.y = y + ROW
  }

  // --- Waived receipts: deliberate, not forgotten ------------------------------------------
  if (report.waivedReceipts.length) {
    heading('Ohne Beleg (vermerkt)')
    note(
      'Vom Inhaber als «kein Beleg nötig» markiert, z. B. Miete mit Mietvertrag oder Bankspesen.'
    )
    pdf.font('Helvetica').fontSize(9).fillColor(MUTED)
    for (const w of report.waivedReceipts) {
      ensure(14)
      const y = pdf.y
      pdf.text(dateFmt(w.date), LEFT, y, { lineBreak: false })
      pdf.text(w.vendor || w.title, LEFT + 70, y, { width: 300, lineBreak: false, ellipsis: true })
      pdf.text(chf(w.grossRappen), RIGHT - 90, y, { width: 90, align: 'right', lineBreak: false })
      pdf.y = y + 13
    }
  }

  // --- Closing note --------------------------------------------------------------------------
  pdf.y += 6
  note('Alle Beträge in CHF, brutto inkl. MWST. Belege siehe Ordner «belege» in diesem Export.')

  // --- Running header + footer on every page ---------------------------------------------------
  const range = pdf.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(i)
    // Drawing outside the content box must not trigger an automatic page break.
    const saved = pdf.page.margins.bottom
    pdf.page.margins.bottom = 0
    pdf.font('Helvetica').fontSize(8).fillColor(FAINT)
    if (i > 0) {
      pdf.text(`${report.sender.name}  ·  Steuerexport ${report.year}`, LEFT, 38, {
        width: WIDTH,
        lineBreak: false
      })
      pdf.moveTo(LEFT, 52).lineTo(RIGHT, 52).lineWidth(0.5).strokeColor(RULE).stroke()
    }
    const fy = PAGE.height - 42
    pdf.text(`Erstellt am ${todayCh(generatedAt)} mit chohle`, LEFT, fy, {
      width: WIDTH / 2,
      lineBreak: false
    })
    pdf.text(`Seite ${i + 1} / ${range.count}`, LEFT + WIDTH / 2, fy, {
      width: WIDTH / 2,
      align: 'right',
      lineBreak: false
    })
    pdf.page.margins.bottom = saved
  }

  pdf.end()
  return done
}
