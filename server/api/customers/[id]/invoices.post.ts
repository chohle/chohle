export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const customerId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(customerId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const customer = db
    .prepare('SELECT payment_term_days FROM customers WHERE id = ?')
    .get(customerId) as { payment_term_days: number } | undefined
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }

  // Start blank so the owner fills in number and title themselves. Dates get a
  // sensible default (today, plus the payment term) but stay editable.
  const now = new Date()
  const issue = now.toISOString().slice(0, 10)
  const due = new Date(now.getTime() + customer.payment_term_days * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO invoices (customer_id, number, title, issue_date, due_date) VALUES (?, ?, ?, ?, ?)'
    )
    .run(customerId, '', '', issue, due)

  return { id: lastInsertRowid }
})