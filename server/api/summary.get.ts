function lastSixMonths(month: string): string[] {
  const [year, mo] = month.split('-').map(Number)
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, mo - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const q = getQuery(event).month
  const month =
    typeof q === 'string' && /^\d{4}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 7)

  const db = useDb()

  const expenses = (
    db
      .prepare('SELECT COALESCE(SUM(amount_rappen), 0) AS total FROM expenses WHERE date LIKE ?')
      .get(`${month}%`) as { total: number }
  ).total

  const income = (
    db
      .prepare('SELECT COALESCE(SUM(amount_rappen), 0) AS total FROM income_payments WHERE month = ?')
      .get(month) as { total: number }
  ).total

  const byCategory = (
    db
      .prepare(
        `SELECT c.name AS name, c.color AS color, c.icon AS icon, SUM(e.amount_rappen) AS total
         FROM expenses e
         LEFT JOIN categories c ON c.id = e.category_id
         WHERE e.date LIKE ?
         GROUP BY e.category_id
         ORDER BY total DESC`
      )
      .all(`${month}%`) as Array<{ name: string | null, color: string | null, icon: string | null, total: number }>
  ).map((r) => ({
    name: r.name ?? 'Uncategorized',
    color: r.color ?? '#9ca3af',
    icon: r.icon ?? 'i-lucide-circle-help',
    total: r.total
  }))

  const months = lastSixMonths(month)
  const grouped = db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym, SUM(amount_rappen) AS total
       FROM expenses WHERE substr(date, 1, 7) >= ? GROUP BY ym`
    )
    .all(months[0]) as Array<{ ym: string, total: number }>
  const expensesByMonth = Object.fromEntries(grouped.map((r) => [r.ym, r.total]))

  const incomeGrouped = db
    .prepare(
      `SELECT month AS ym, SUM(amount_rappen) AS total
       FROM income_payments WHERE month >= ? GROUP BY month`
    )
    .all(months[0]) as Array<{ ym: string, total: number }>
  const incomeByMonth = Object.fromEntries(incomeGrouped.map((r) => [r.ym, r.total]))

  const trend = months.map((m) => ({
    month: m,
    income: incomeByMonth[m] ?? 0,
    expenses: expensesByMonth[m] ?? 0
  }))

  const sources = db
    .prepare(
      'SELECT id, company, salary_rappen, payout_day, canton, payout_rule FROM income_sources ORDER BY company'
    )
    .all() as Array<{
    id: number
    company: string
    salary_rappen: number
    payout_day: number
    canton: string
    payout_rule: 'earlier' | 'later' | 'none'
  }>
  const paidIds = new Set(
    (db.prepare('SELECT source_id FROM income_payments WHERE month = ?').all(month) as {
      source_id: number
    }[]).map((r) => r.source_id)
  )

  const [year, mo] = month.split('-').map(Number)
  const holidaysByCanton = new Map<string, Map<string, string>>()
  const recurring = []
  let expected = 0
  for (const s of sources) {
    expected += s.salary_rappen
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
    recurring.push({
      company: s.company,
      salary_rappen: s.salary_rappen,
      paid: paidIds.has(s.id),
      pay_date: date,
      reason
    })
  }

  return {
    month,
    income,
    expenses,
    net: income - expenses,
    expected,
    outstanding: expected - income,
    byCategory,
    trend,
    recurring
  }
})