// Where a receipt lives inside the tax-export ZIP. Shared by the ZIP writer,
// the CSV journal and the PDF so all three agree on the same name:
//
//   belege/<Lieferant>/<NNNN>_<Datum>[_k].<ext>
//
// One folder per vendor keeps the twelve Migros receipts of a year together;
// the journal number in front keeps the files in booking order inside it.
import { extname } from 'node:path'
import type { TaxJournalRow } from './taxReport'

/** Filesystem-safe folder/file name segment. */
export function slug(s: string): string {
  return (
    (s || '')
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'Ohne_Lieferant'
  )
}

/** Journal number of the i-th expense row; it doubles as the receipt number. */
export function journalNr(i: number): string {
  return String(i + 1).padStart(4, '0')
}

/** Vendor folder of a row's receipts, relative to the ZIP root. */
export function receiptFolder(row: TaxJournalRow): string {
  return `belege/${slug(row.vendor || row.title)}`
}

/** File name (no folder) of the k-th receipt of a journal row. */
export function receiptFileName(nr: string, row: TaxJournalRow, k: number): string {
  const a = row.attachments[k]!
  const ext = extname(a.storedName) || extname(a.filename) || ''
  const suffix = row.attachments.length > 1 ? `_${k + 1}` : ''
  return `${nr}_${row.date}${suffix}${ext}`
}

/** Full path of the k-th receipt inside the ZIP. */
export function receiptPath(nr: string, row: TaxJournalRow, k: number): string {
  return `${receiptFolder(row)}/${receiptFileName(nr, row, k)}`
}
