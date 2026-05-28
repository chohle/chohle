export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const q = getQuery(event).year
  const parsed = typeof q === 'string' && /^\d{4}$/.test(q) ? Number(q) : new Date().getFullYear()
  const year = String(parsed)

  const db = useDb()

  const expensesByMonth = Object.fromEntries(
    (db
      .prepare(
        `SELECT substr(date, 1, 7) AS ym, SUM(amount_rappen) AS total
         FROM expenses WHERE substr(date, 1, 4) = ? GROUP BY ym`
      )
      .all(year) as Array<{ ym: string, total: number }>).map((r) => [r.ym, r.total])
  )

  const salaryByMonth = Object.fromEntries(
    (db
      .prepare(
        `SELECT month AS ym, SUM(amount_rappen) AS total
         FROM income_payments WHERE substr(month, 1, 4) = ? GROUP BY ym`
      )
      .all(year) as Array<{ ym: string, total: number }>).map((r) => [r.ym, r.total])
  )

  const invoiceByMonth = Object.fromEntries(
    (db
      .prepare(
        `SELECT substr(paid_at, 1, 7) AS ym, COALESCE(SUM(total_rappen), 0) AS total
         FROM invoices WHERE status = 'paid' AND substr(paid_at, 1, 4) = ? GROUP BY ym`
      )
      .all(year) as Array<{ ym: string, total: number }>).map((r) => [r.ym, r.total])
  )

  const months = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`
    const income = (salaryByMonth[ym] ?? 0) + (invoiceByMonth[ym] ?? 0)
    const expenses = expensesByMonth[ym] ?? 0
    return { ym, income, expenses, net: income - expenses }
  })

  const totals = months.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expenses: acc.expenses + m.expenses,
      net: acc.net + m.net
    }),
    { income: 0, expenses: 0, net: 0 }
  )

  return { year: parsed, months, totals }
})
