export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { q } = getQuery(event)
  const term = String(q ?? '').trim()
  if (term.length < 1) {
    return { invoices: [], customers: [], articles: [], expenses: [] }
  }

  const like = `%${term.replace(/[%_]/g, c => '\\' + c)}%`
  const db = useDb()
  const limit = 8

  const invoices = db
    .prepare(
      `SELECT i.id, i.number, i.title, c.name AS customer_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.number LIKE ? ESCAPE '\\' OR i.title LIKE ? ESCAPE '\\'
       ORDER BY i.issue_date DESC, i.id DESC LIMIT ?`
    )
    .all(like, like, limit)

  const customers = db
    .prepare(
      `SELECT id, name, customer_number, city
       FROM customers
       WHERE name LIKE ? ESCAPE '\\' OR customer_number LIKE ? ESCAPE '\\'
       ORDER BY name LIMIT ?`
    )
    .all(like, like, limit)

  const articles = db
    .prepare(
      `SELECT id, name, unit, default_price_rappen
       FROM articles
       WHERE name LIKE ? ESCAPE '\\'
       ORDER BY name LIMIT ?`
    )
    .all(like, limit)

  const expenses = db
    .prepare(
      `SELECT id, title, vendor, date, amount_rappen
       FROM expenses
       WHERE title LIKE ? ESCAPE '\\' OR vendor LIKE ? ESCAPE '\\'
       ORDER BY date DESC, id DESC LIMIT ?`
    )
    .all(like, like, limit)

  return { invoices, customers, articles, expenses }
})
