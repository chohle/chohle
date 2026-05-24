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

  return {
    month,
    income,
    expenses,
    net: income - expenses,
    byCategory,
    trend
  }
})