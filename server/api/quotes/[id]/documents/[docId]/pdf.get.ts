// Preview/download a quote document: editor docs render to PDF, uploaded file
// docs stream as-is with their original type.
import { quoteDocumentAttachment } from '~~/server/utils/documentPdf'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || quoteId <= 0 || !Number.isInteger(docId) || docId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const out = await quoteDocumentAttachment(useDb(), docId, quoteId)
  if (!out) throw createError({ statusCode: 404, statusMessage: 'document not found' })

  setHeader(event, 'Content-Type', out.contentType)
  setHeader(event, 'Content-Disposition', `inline; filename="${out.filename}"`)
  return out.content
})
