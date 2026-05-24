interface SourceRow {
  id: number
  company: string
  job_title: string | null
  salary_rappen: number
  currency: string
  payout_day: number
  canton: string
  payout_rule: 'earlier' | 'later' | 'none'
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const q = getQuery(event).month
  const month =
    typeof q === 'string' && /^\d{4}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 7)
  const [year, mo] = month.split('-').map(Number)

  const db = useDb()
  const sources = db
    .prepare(
      `SELECT id, company, job_title, salary_rappen, currency, payout_day, canton, payout_rule
       FROM income_sources ORDER BY company`
    )
    .all() as SourceRow[]

  const paidIds = new Set(
    (db.prepare('SELECT source_id FROM income_payments WHERE month = ?').all(month) as {
      source_id: number
    }[]).map((r) => r.source_id)
  )

  const holidaysByCanton = new Map<string, Map<string, string>>()
  const result = []
  for (const s of sources) {
    if (!holidaysByCanton.has(s.canton)) {
      holidaysByCanton.set(s.canton, await getHolidays(s.canton, year))
    }
    const { date, reason } = computePayout(
      year,
      mo,
      s.payout_day,
      s.payout_rule,
      holidaysByCanton.get(s.canton)!
    )
    result.push({ ...s, pay_date: date, reason, paid: paidIds.has(s.id) })
  }

  return { month, sources: result }
})
