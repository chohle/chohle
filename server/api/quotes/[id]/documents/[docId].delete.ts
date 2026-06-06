export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || !Number.isInteger(docId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const info = useDb()
    .prepare('DELETE FROM quote_documents WHERE id = ? AND quote_id = ?')
    .run(docId, quoteId)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'document not found' })
  }
  return { ok: true }
})
