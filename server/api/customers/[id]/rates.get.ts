export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return db
    .prepare(
      `SELECT a.id AS article_id, a.name, a.unit, a.default_price_rappen,
              r.price_rappen AS override_rappen
       FROM articles a
       LEFT JOIN customer_rates r ON r.article_id = a.id AND r.customer_id = ?
       ORDER BY a.name`
    )
    .all(id)
})
