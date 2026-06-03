// Delete a signature. If it was the default, the most recent remaining one is
// promoted so there's still a default to preselect when composing.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const row = db.prepare(`SELECT is_default FROM signatures WHERE id = ?`).get(id) as
    | { is_default: number }
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'signature not found' })
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM signatures WHERE id = ?`).run(id)
    if (row.is_default) {
      const next = db
        .prepare(`SELECT id FROM signatures ORDER BY created_at DESC LIMIT 1`)
        .get() as { id: number } | undefined
      if (next) db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = ?`).run(next.id)
    }
  })()
  return { ok: true }
})
