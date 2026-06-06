// List the documents attached to a quote. content is parsed back to the TipTap
// JSON object so the editor can load it directly.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(quoteId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const rows = useDb()
    .prepare(
      `SELECT id, title, content, attach, sort_order, updated_at
       FROM quote_documents WHERE quote_id = ? ORDER BY sort_order, id`
    )
    .all(quoteId) as Array<{ content: string; [k: string]: unknown }>

  const documents = rows.map((r) => {
    let content: unknown
    try {
      content = r.content ? JSON.parse(r.content) : { type: 'doc', content: [] }
    } catch {
      content = { type: 'doc', content: [] }
    }
    return { ...r, content }
  })
  return { documents }
})
