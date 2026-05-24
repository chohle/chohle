export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const body = await readBody(event)
  const rates = Array.isArray(body?.rates) ? body.rates : []

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const upsert = db.prepare(
    `INSERT INTO customer_rates (customer_id, article_id, price_rappen)
     VALUES (?, ?, ?)
     ON CONFLICT(customer_id, article_id) DO UPDATE SET price_rappen = excluded.price_rappen`
  )
  const del = db.prepare('DELETE FROM customer_rates WHERE customer_id = ? AND article_id = ?')

  db.transaction(() => {
    for (const r of rates) {
      const articleId = Number(r?.articleId)
      if (!Number.isInteger(articleId)) continue
      const price = Number(r?.price)
      // Blank or invalid means "use the default", so we drop any override.
      if (r?.price === null || r?.price === '' || r?.price === undefined || !Number.isFinite(price) || price < 0) {
        del.run(id, articleId)
      } else {
        upsert.run(id, articleId, Math.round(price * 100))
      }
    }
  })()

  return { ok: true }
})
