// Upload an existing file (PDF/DOCX/…) as a quote document, for layouts the
// in-app editor can't reproduce. Stored as-is and attached to the quote email.
import { deleteUpload, saveDocumentUpload } from '~~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const quote = db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'quote not found' })

  const { storedName, originalName, mime } = await saveDocumentUpload(event)

  // Allocate sort_order and INSERT atomically so concurrent uploads can't share
  // the same order. If the INSERT fails, delete the file we just stored so it
  // isn't orphaned on disk with no row pointing at it.
  try {
    const create = db.transaction(() => {
      const nextOrder = (
        db
          .prepare(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM quote_documents WHERE quote_id = ?'
          )
          .get(quoteId) as { n: number }
      ).n
      return db
        .prepare(
          `INSERT INTO quote_documents (quote_id, title, kind, file_name, file_path, mime, sort_order)
           VALUES (?, ?, 'file', ?, ?, ?, ?)`
        )
        .run(quoteId, originalName, originalName, storedName, mime, nextOrder)
    })
    return { id: Number(create().lastInsertRowid) }
  } catch (err) {
    await deleteUpload(storedName).catch(() => {})
    throw err
  }
})
