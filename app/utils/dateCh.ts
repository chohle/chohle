// Swiss/German date format helpers: DD.MM.YYYY <-> ISO YYYY-MM-DD.
// Use these everywhere we render or parse user-facing dates so the format
// stays consistent across tables, forms, and pickers.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const CH_RE = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/

export function dateCh(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = ISO_RE.exec(iso)
  if (!m) return iso
  return `${m[3]}.${m[2]}.${m[1]}`
}

// Parse a user-typed date in DD.MM.YYYY (or DD.M.YY etc.) back to ISO.
// Returns '' for unparseable input (including impossible dates like
// 31.02.2026 or 32.13.2025) so callers can keep the field blank.
export function parseCh(text: string): string {
  const m = CH_RE.exec(text.trim())
  if (!m) return ''
  const day = m[1]!.padStart(2, '0')
  const month = m[2]!.padStart(2, '0')
  let year = m[3]!
  if (year.length === 2) year = (Number(year) > 50 ? '19' : '20') + year

  // Validate that the components compose a real calendar date by
  // round-tripping through a Date object. JS Date overflows month/day,
  // so we check the parts come back unchanged.
  const y = Number(year)
  const mo = Number(month)
  const d = Number(day)
  const probe = new Date(y, mo - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return ''

  return `${year}-${month}-${day}`
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
