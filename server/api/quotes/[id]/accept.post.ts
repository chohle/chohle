// Mark a quote as accepted. Stamps accepted_at so the editor and the
// list can show "accepted on YYYY-MM-DD" without resorting to the
// audit log. Idempotent: re-accepting is a no-op.

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
       SET status = 'accepted',
           accepted_at = COALESCE(accepted_at, ?),
           declined_at = NULL
       WHERE id = ?`
    )
    .run(today, id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  // Read back so an idempotent re-accept returns the row's actual date
  // (COALESCE keeps the original; we'd otherwise lie about the new one).
  const row = db.prepare('SELECT accepted_at FROM quotes WHERE id = ?').get(id) as
    | { accepted_at: string | null }
    | undefined
  return { ok: true, accepted_at: row?.accepted_at ?? today }
})
