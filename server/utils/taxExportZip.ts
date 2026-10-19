// Assembles the year-end tax bundle as a ZIP:
//   Steuerexport-<year>.pdf   - the Erfolgsrechnung report
//   buchungen-<year>.csv      - the journal (Aufwand + Ertrag), chronological
//   belege/<Lieferant>/NNNN_<Datum>.<ext> - every receipt, one folder per vendor
import type { Database } from 'better-sqlite3'
import { zipSync, strToU8 } from 'fflate'
import { buildTaxReport, type TaxJournalRow, type TaxReport } from './taxReport'
import { journalNr, receiptPath } from './taxReceiptFiles'
import { renderTaxReportPdf } from './taxReportPdf'
import { readUpload } from './uploads'

/** A single CSV cell, quoted/escaped when it contains a separator or quote. */
function cell(v: string | number): string {
  const s = String(v ?? '')
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const amount = (rappen: number) => (rappen / 100).toFixed(2)

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

/** "ja" / "fehlt" / "nicht nötig" — the third state is the owner's explicit waiver. */
function receiptStatus(row: TaxJournalRow): string {
  if (row.attachments.length) return 'ja'
  return row.receiptWaived ? 'nicht nötig' : 'fehlt'
}

export const CSV_HEADER = [
  'Nr',
  'Datum',
  'Typ',
  'Lieferant / Kunde',
  'Titel',
  'Kategorie',
  'Brutto CHF',
  'MWST %',
  'Vorsteuer CHF',
  'Netto CHF',
  'Beleg',
  'Belegstatus'
]

/**
 * The journal CSV: every booking of the year, expenses and income alike, in
 * date order. Semicolon-separated with a UTF-8 BOM so Swiss Excel opens it
 * directly. Nr is the receipt number, so only expense rows carry one; Beleg
 * is the receipt's path inside the ZIP (belege/<Lieferant>/<Nr>_<Datum>.<ext>).
 */
export function buildJournalCsv(report: TaxReport): string {
  const rows: { date: string; order: number; cells: (string | number)[] }[] = []

  report.expenses.journal.forEach((row, i) => {
    const nr = journalNr(i)
    const files = row.attachments.map((_, k) => receiptPath(nr, row, k))
    rows.push({
      date: row.date,
      order: 0,
      cells: [
        nr,
        row.date,
        'Aufwand',
        row.vendor,
        row.title,
        row.category,
        amount(row.grossRappen),
        row.vatRate ? String(row.vatRate) : '',
        amount(row.inputVatRappen),
        amount(row.grossRappen - row.inputVatRappen),
        files.join(' | '),
        receiptStatus(row)
      ]
    })
  })
  for (const inv of report.income.invoices) {
    rows.push({
      date: inv.paidAt,
      order: 1,
      cells: [
        '',
        inv.paidAt,
        'Ertrag',
        inv.customer,
        `Rechnung ${inv.number}`,
        'Honorar',
        amount(inv.totalRappen),
        '',
        '',
        '',
        '',
        ''
      ]
    })
  }
  for (const s of report.income.salary) {
    const [y, m] = s.month.split('-')
    rows.push({
      date: s.date,
      order: 1,
      cells: [
        '',
        s.date,
        'Ertrag',
        s.company,
        `Lohn ${MONTHS[Number(m) - 1] ?? m} ${y}`,
        'Lohn',
        amount(s.amountRappen),
        '',
        '',
        '',
        '',
        ''
      ]
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  const lines = [CSV_HEADER.join(';'), ...rows.map((r) => r.cells.map(cell).join(';'))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export interface TaxExportFile {
  filename: string
  buffer: Buffer
}

/** Build the full tax-export ZIP for a year. */
export async function buildTaxExportZip(db: Database, year: number): Promise<TaxExportFile> {
  const report = buildTaxReport(db, year)
  const generatedAt = new Date()
  const files: Record<string, Uint8Array> = {}

  // --- report PDF ---
  const logoPath = (
    db.prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
      { logo_path: string | null } | undefined
  )?.logo_path
  files[`Steuerexport-${year}.pdf`] = await renderTaxReportPdf(
    report,
    await readUpload(logoPath),
    generatedAt
  )

  // --- CSV journal ---
  files[`buchungen-${year}.csv`] = strToU8(buildJournalCsv(report))

  // --- receipt files, one folder per vendor, numbered to the journal ---
  for (let i = 0; i < report.expenses.journal.length; i++) {
    const row = report.expenses.journal[i]!
    const nr = journalNr(i)
    for (let k = 0; k < row.attachments.length; k++) {
      const buf = await readUpload(row.attachments[k]!.storedName)
      if (!buf) continue
      files[receiptPath(nr, row, k)] = buf
    }
  }

  // level 0: receipts (jpg/png/pdf) are already compressed.
  return { filename: `Steuerexport-${year}.zip`, buffer: Buffer.from(zipSync(files, { level: 0 })) }
}
