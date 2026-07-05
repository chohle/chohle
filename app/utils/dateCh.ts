// Swiss/German date format helpers: DD.MM.YYYY <-> ISO YYYY-MM-DD.
// Use these everywhere we render or parse user-facing dates so the format
// stays consistent across tables, forms, and pickers.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function dateCh(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = ISO_RE.exec(iso)
  if (!m) return iso
  return `${m[3]}.${m[2]}.${m[1]}`
}
