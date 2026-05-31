import { rm } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const files = db.prepare('SELECT stored_name FROM attachments WHERE expense_id = ?').all(id) as {
    stored_name: string
  }[]
  for (const f of files) {
    await rm(join(uploadsDir(), f.stored_name), { force: true })
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id)
  return { ok: true }
})
