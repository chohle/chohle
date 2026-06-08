// Streams the year-end tax-export ZIP (report PDF + CSV journal + receipts).
import { buildTaxExportZip } from '~~/server/utils/taxExportZip'
import { contentDisposition } from '~~/server/utils/uploads'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const year = Number(getRouterParam(event, 'year'))
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw createError({ statusCode: 400, statusMessage: 'invalid year' })
  }
  const { filename, buffer } = await buildTaxExportZip(useDb(), year)
  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', contentDisposition(filename, 'attachment'))
  return buffer
})
