// Delete a quote document. For uploaded file docs the stored file is removed
// too (best-effort, after the row is gone).
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || quoteId <= 0 || !Number.isInteger(docId) || docId <= 0) {
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
  // Best-effort: drop the stored file for uploaded docs. The row is already
  // gone, so a failed unlink (missing file, FS hiccup) must not fail the
  // request — at worst it leaves an orphaned file.
  if (row.file_path) {
    try {
      await deleteUpload(row.file_path)
    } catch {
      /* ignore — orphaned file, not user-facing */
    }
  }
  return { ok: true }
})
