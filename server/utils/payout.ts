export type PayoutRule = 'earlier' | 'later' | 'none'

export interface PayoutResult {
  date: string
  reason: string | null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function conflict(d: Date, holidays: Map<string, string>): string | null {
  const weekday = d.getDay()
  if (weekday === 0 || weekday === 6) return 'Weekend'
  return holidays.get(iso(d)) ?? null
}

// Real pay date for a month. If the nominal day falls on a weekend or a cantonal
// holiday, it shifts earlier or later per the rule until it lands on a working day.
export function computePayout(
  year: number,
  month: number,
  payoutDay: number,
  rule: PayoutRule,
  holidays: Map<string, string> = new Map()
): PayoutResult {
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(Math.max(payoutDay, 1), lastDay)
  const d = new Date(year, month - 1, day)

  const reason = conflict(d, holidays)
  if (rule === 'none' || !reason) {
    return { date: iso(d), reason: null }
  }

  const step = rule === 'earlier' ? -1 : 1
  while (conflict(d, holidays)) {
    d.setDate(d.getDate() + step)
  }
  return { date: iso(d), reason }
}