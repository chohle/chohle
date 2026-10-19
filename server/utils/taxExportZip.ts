// Assembles the year-end tax bundle as a ZIP:
//   README.txt                - what is in here, for the Treuhänder
//   Steuerexport-<year>.pdf   - the Erfolgsrechnung report
//   buchungen-<year>.csv      - the journal (Aufwand + Ertrag), chronological
//   belege/NNNN_<vendor>_<date>.<ext> - every receipt, numbered to the journal
import type { Database } from 'better-sqlite3'
import { extname } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { buildTaxReport, type TaxJournalRow, type TaxReport } from './taxReport'
import { renderTaxReportPdf } from './taxReportPdf'
import { readUpload } from './uploads'

/** Filesystem-safe slug for a zip entry name segment. */
function slug(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/** A single CSV cell, quoted/escaped when it contains a separator or quote. */
function cell(v: string | number): string {
  const s = String(v ?? '')
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const amount = (rappen: number) => (rappen / 100).toFixed(2)
const dateCh = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`

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

/** Journal number of the i-th expense row; it doubles as the receipt number. */
export function journalNr(i: number): string {
  return String(i + 1).padStart(4, '0')
}

/** File name of the k-th receipt of a journal row inside belege/. */
export function receiptFileName(nr: string, row: TaxJournalRow, k: number): string {
  const a = row.attachments[k]!
  const ext = extname(a.storedName) || extname(a.filename) || ''
  const suffix = row.attachments.length > 1 ? `_${k + 1}` : ''
  return `${nr}_${slug(row.vendor || row.title)}_${row.date}${suffix}${ext}`
}

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
 * directly. Nr is the receipt number, so only expense rows carry one.
 */
export function buildJournalCsv(report: TaxReport): string {
  const rows: { date: string; order: number; cells: (string | number)[] }[] = []

  report.expenses.journal.forEach((row, i) => {
    const nr = journalNr(i)
    const files = row.attachments.map((_, k) => receiptFileName(nr, row, k))
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

/** Short README so the bundle explains itself when it lands in someone's inbox. */
export function buildReadme(report: TaxReport, generatedAt: Date): string {
  const journal = report.expenses.journal
  const receipts = journal.reduce((n, r) => n + r.attachments.length, 0)
  const y = report.year
  const stats = [
    `${journal.length} Buchungen`,
    `${receipts} Belege`,
    `${report.missingReceipts.length} fehlend`,
    `${report.waivedReceipts.length} ohne Beleg (vermerkt)`
  ].join(', ')
  return [
    `Steuerexport ${y} – ${report.sender.name}`,
    `Erstellt am ${dateCh(generatedAt)} mit chohle. ${stats}.`,
    '',
    'Inhalt',
    `  Steuerexport-${y}.pdf   Erfolgsrechnung, MWST-Zusammenfassung und Aufwandjournal nach Monat.`,
    `  buchungen-${y}.csv      Journal aller Buchungen (Aufwand und Ertrag), chronologisch.`,
    '                          Semikolon-getrennt, UTF-8 mit BOM: öffnet direkt in Excel (Schweiz).',
    '  belege/                 Alle Belege, benannt nach Journalnummer: NNNN_<Lieferant>_<Datum>.<Endung>',
    '',
    'Hinweise',
    '  - Beträge in CHF, brutto inkl. MWST. Netto = Brutto − Vorsteuer.',
    '  - Die Nr ist die Belegnummer. Ertragsbuchungen (Rechnungen, Lohn) haben keine Nr.',
    '  - Belegstatus: ja = Beleg liegt bei · fehlt = kein Beleg erfasst ·',
    '    nicht nötig = vom Inhaber vermerkt (z. B. Miete mit Mietvertrag, Bankspesen).',
    ''
  ].join('\r\n')
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

  // --- CSV journal + README ---
  files[`buchungen-${year}.csv`] = strToU8(buildJournalCsv(report))
  files['README.txt'] = strToU8('﻿' + buildReadme(report, generatedAt))

  // --- receipt files, numbered to the journal ---
  for (let i = 0; i < report.expenses.journal.length; i++) {
    const row = report.expenses.journal[i]!
    const nr = journalNr(i)
    for (let k = 0; k < row.attachments.length; k++) {
      const buf = await readUpload(row.attachments[k]!.storedName)
      if (!buf) continue
      files[`belege/${receiptFileName(nr, row, k)}`] = buf
    }
  }

  // level 0: receipts (jpg/png/pdf) are already compressed.
  return { filename: `Steuerexport-${year}.zip`, buffer: Buffer.from(zipSync(files, { level: 0 })) }
}
