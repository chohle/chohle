export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  const today = new Date().toISOString().slice(0, 10)
  const db = useDb()
  const info = db
    .prepare(
      `UPDATE quotes
       SET status = 'declined',
           declined_at = COALESCE(declined_at, ?),
           accepted_at = NULL
       WHERE id = ?`
    )
    .run(today, id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  // Read back so an idempotent re-decline returns the row's actual date
  // (COALESCE keeps the original; we'd otherwise lie about the new one).
  const row = db.prepare('SELECT declined_at FROM quotes WHERE id = ?').get(id) as
    | { declined_at: string | null }
    | undefined
  return { ok: true, declined_at: row?.declined_at ?? today }
})
