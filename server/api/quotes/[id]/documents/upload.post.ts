// Upload an existing file (PDF/DOCX/…) as a quote document, for layouts the
// in-app editor can't reproduce. Stored as-is and attached to the quote email.
import { saveDocumentUpload } from '~~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(quoteId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const quote = db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'quote not found' })

  const { storedName, originalName, mime } = await saveDocumentUpload(event)
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
      `INSERT INTO quote_documents (quote_id, title, kind, file_name, file_path, mime, sort_order)
       VALUES (?, ?, 'file', ?, ?, ?, ?)`
    )
    .run(quoteId, originalName, originalName, storedName, mime, nextOrder)
  return { id: Number(info.lastInsertRowid) }
})
