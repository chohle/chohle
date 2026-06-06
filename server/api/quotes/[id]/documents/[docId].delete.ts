export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || !Number.isInteger(docId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const row = db
    .prepare('SELECT file_path FROM quote_documents WHERE id = ? AND quote_id = ?')
    .get(docId, quoteId) as { file_path: string } | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'document not found' })
  }
  db.prepare('DELETE FROM quote_documents WHERE id = ? AND quote_id = ?').run(docId, quoteId)
  // Best-effort: drop the stored file for uploaded docs.
  if (row.file_path) await deleteUpload(row.file_path)
  return { ok: true }
})
