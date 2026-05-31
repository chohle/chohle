import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

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
    const type = file.type || 'application/octet-stream'
    if (!ALLOWED_RECEIPT_TYPES.includes(type)) {
      throw createError({ statusCode: 415, statusMessage: `Unsupported type: ${type}` })
    }
    const storedName = `${randomUUID()}${extname(file.filename!)}`
    await writeFile(join(dir, storedName), file.data)
    const { lastInsertRowid } = insert.run(
      expenseId,
      file.filename,
      storedName,
      type,
      file.data.length
    )
    saved.push({ id: lastInsertRowid, filename: file.filename })
  }

  return { saved }
})
