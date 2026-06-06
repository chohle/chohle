// Render a single quote document to PDF for preview/download in the browser.
import { quoteDocumentToPdf } from '~~/server/utils/documentPdf'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || !Number.isInteger(docId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const out = await quoteDocumentToPdf(useDb(), docId, quoteId)
  if (!out) throw createError({ statusCode: 404, statusMessage: 'document not found' })

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `inline; filename="${out.filename}"`)
  return out.buffer
})
