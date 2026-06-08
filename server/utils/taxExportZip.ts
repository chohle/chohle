// Assembles the year-end tax bundle as a ZIP:
//   Steuerexport-<year>.pdf   - the Erfolgsrechnung report
//   buchungen-<year>.csv      - the journal for the Treuhänder
//   belege/NNNN_<vendor>_<date>.<ext> - every receipt, numbered to the journal
import type { Database } from 'better-sqlite3'
import { extname } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { buildTaxReport } from './taxReport'
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

export interface TaxExportFile {
  filename: string
  buffer: Buffer
}

/** Build the full tax-export ZIP for a year. */
export async function buildTaxExportZip(db: Database, year: number): Promise<TaxExportFile> {
  const report = buildTaxReport(db, year)
  const files: Record<string, Uint8Array> = {}

  // --- report PDF ---
  const logoPath = (
    db.prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
      | { logo_path: string | null }
      | undefined
  )?.logo_path
  files[`Steuerexport-${year}.pdf`] = await renderTaxReportPdf(report, await readUpload(logoPath))

  // --- CSV journal + receipt files (numbered together) ---
  const header = [
    'Nr',
    'Datum',
    'Typ',
    'Beschreibung',
    'Kategorie',
    'Betrag CHF',
    'MWST %',
    'Vorsteuer CHF',
    'Beleg'
  ]
  const lines: string[] = [header.join(';')]

  for (let i = 0; i < report.expenses.journal.length; i++) {
    const row = report.expenses.journal[i]!
    const nr = String(i + 1).padStart(4, '0')
    lines.push(
      [
        nr,
        cell(row.date),
        'Aufwand',
        cell(row.vendor || row.title),
        cell(row.category),
        amount(row.grossRappen),
        row.vatRate ? String(row.vatRate) : '',
        amount(row.inputVatRappen),
        row.attachments.length ? nr : 'fehlt'
      ].join(';')
    )
    // Place each receipt under belege/, named with the journal number.
    for (let k = 0; k < row.attachments.length; k++) {
      const a = row.attachments[k]!
      const buf = await readUpload(a.storedName)
      if (!buf) continue
      const ext = extname(a.storedName) || extname(a.filename) || ''
      const suffix = row.attachments.length > 1 ? `_${k + 1}` : ''
      files[`belege/${nr}_${slug(row.vendor || row.title)}_${row.date}${suffix}${ext}`] = buf
    }
  }

  // Income rows (no receipt number).
  for (const inv of report.income.invoices) {
    lines.push(
      [
        '',
        cell(inv.paidAt),
        'Ertrag',
        cell(inv.customer),
        cell(`Rechnung ${inv.number}`),
        amount(inv.totalRappen),
        '',
        '',
        ''
      ].join(';')
    )
  }
  for (const s of report.income.salary) {
    lines.push(
      [
        '',
        cell(s.month),
        'Ertrag',
        cell(s.company),
        'Lohn',
        amount(s.amountRappen),
        '',
        '',
        ''
      ].join(';')
    )
  }

  // UTF-8 BOM so Swiss Excel opens the umlauts correctly.
  files[`buchungen-${year}.csv`] = strToU8('﻿' + lines.join('\r\n') + '\r\n')

  // level 0: receipts (jpg/png/pdf) are already compressed.
  return { filename: `Steuerexport-${year}.zip`, buffer: Buffer.from(zipSync(files, { level: 0 })) }
}
