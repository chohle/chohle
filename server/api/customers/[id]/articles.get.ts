export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return db
    .prepare(
      `SELECT id, name, unit, default_price_rappen, default_mwst
       FROM articles WHERE customer_id = ? ORDER BY name`
    )
    .all(id)
})
