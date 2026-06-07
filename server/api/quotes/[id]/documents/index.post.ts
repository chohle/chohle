// Create a new (empty) document on a quote. Returns its id; the editor then
// saves content via PUT.
interface Body {
  title?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const quote = db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'quote not found' })

  const body = await readBody<Body>(event)
  const title = (body?.title ?? '').trim() || 'Dokument'

  // Allocate sort_order and INSERT in one transaction so two concurrent creates
  // can't read the same MAX and collide on the order.
  const create = db.transaction((t: string) => {
    const nextOrder = (
      db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM quote_documents WHERE quote_id = ?'
        )
        .get(quoteId) as { n: number }
    ).n
    return db
      .prepare(
        `INSERT INTO quote_documents (quote_id, title, content, sort_order)
         VALUES (?, ?, ?, ?)`
      )
      .run(quoteId, t, JSON.stringify({ type: 'doc', content: [] }), nextOrder)
  })
  return { id: Number(create(title).lastInsertRowid) }
})
