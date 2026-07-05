export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const a = parseArticle(await readBody(event))
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO articles (name, unit, default_price_rappen, default_mwst, customer_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(a.name, a.unit, a.priceRappen, a.mwst, id)

  return { id: lastInsertRowid }
})
