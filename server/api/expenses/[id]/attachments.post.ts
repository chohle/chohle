import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const expenseId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(expenseId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  if (!db.prepare('SELECT id FROM expenses WHERE id = ?').get(expenseId)) {
    throw createError({ statusCode: 404, statusMessage: 'Expense not found' })
  }

  const parts = await readMultipartFormData(event)
  const files = (parts ?? []).filter((p) => p.filename && p.data?.length)
  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: 'No files' })
  }

  const dir = uploadsDir()
  const insert = db.prepare(
    `INSERT INTO attachments (expense_id, filename, stored_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?)`
  )

  const saved = []
  for (const file of files) {
    if (file.data.length > MAX_RECEIPT_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Receipt too large (max 20 MB)' })
    }
    // Trust the file's magic bytes, not the client-declared MIME, and derive the
    // stored extension + mime from that. Sanitize the original name so it's safe
    // to echo back in Content-Disposition later.
    const detected = detectReceiptType(file.data)
    if (!detected) {
      throw createError({ statusCode: 415, statusMessage: 'Unsupported receipt type' })
    }
    const original = sanitizeFilename(file.filename, 'Beleg')
    const storedName = `${randomUUID()}${detected.ext}`
    await writeFile(join(dir, storedName), file.data)
    const { lastInsertRowid } = insert.run(
      expenseId,
      original,
      storedName,
      detected.mime,
      file.data.length
    )
    saved.push({ id: lastInsertRowid, filename: original })
  }

  return { saved }
})
