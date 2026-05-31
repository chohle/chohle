import { rm } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const row = db.prepare('SELECT stored_name FROM attachments WHERE id = ?').get(id) as
    | { stored_name: string }
    | undefined
  if (row) {
    await rm(join(uploadsDir(), row.stored_name), { force: true })
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
  }
  return { ok: true }
})
