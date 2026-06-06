// Create a new (empty) document on a quote. Returns its id; the editor then
// saves content via PUT.
interface Body {
  title?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(quoteId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const quote = db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'quote not found' })

  const body = await readBody<Body>(event)
  const title = (body?.title ?? '').trim() || 'Dokument'
  const nextOrder =
    (
      db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM quote_documents WHERE quote_id = ?'
        )
        .get(quoteId) as { n: number }
    ).n ?? 0

  const info = db
    .prepare(
      `INSERT INTO quote_documents (quote_id, title, content, sort_order)
       VALUES (?, ?, ?, ?)`
    )
    .run(quoteId, title, JSON.stringify({ type: 'doc', content: [] }), nextOrder)
  return { id: Number(info.lastInsertRowid) }
})
