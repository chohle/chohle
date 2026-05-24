export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const customerId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(customerId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const customer = db
    .prepare('SELECT name, payment_term_days FROM customers WHERE id = ?')
    .get(customerId) as { name: string, payment_term_days: number } | undefined
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }

  const now = new Date()
  const issue = now.toISOString().slice(0, 10)
  const due = new Date(now.getTime() + customer.payment_term_days * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const year = now.getFullYear()
  const seq =
    (db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE number LIKE ?').get(`${year}-%`) as {
      n: number
    }).n + 1
  const number = `${year}-${String(seq).padStart(4, '0')}`
  const quarter = Math.floor(now.getMonth() / 3) + 1
  const title = `Q${quarter}/${String(year).slice(2)}: ${customer.name}`

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO invoices (customer_id, number, title, issue_date, due_date) VALUES (?, ?, ?, ?, ?)'
    )
    .run(customerId, number, title, issue, due)

  return { id: lastInsertRowid, number }
})