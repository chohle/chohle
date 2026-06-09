import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const row = useDb()
    .prepare('SELECT filename, stored_name, mime_type FROM attachments WHERE id = ?')
    .get(id) as { filename: string; stored_name: string; mime_type: string } | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const path = join(uploadsDir(), row.stored_name)
  if (!existsSync(path)) {
    throw createError({ statusCode: 404, statusMessage: 'File missing' })
  }

  setHeader(event, 'Content-Type', row.mime_type)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', contentDisposition(row.filename, 'inline'))
  return sendStream(event, createReadStream(path))
})
