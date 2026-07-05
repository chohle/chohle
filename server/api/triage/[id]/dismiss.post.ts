// Dismiss a triage item: it's not worth filing. The row is kept as a tombstone
// (status='dismissed') so the next sync doesn't re-triage the same message.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = requireIdParam(event)

  const db = useDb()
  const info = db
    .prepare(`UPDATE inbound_triage SET status = 'dismissed' WHERE id = ? AND status = 'pending'`)
    .run(id)

  if (info.changes === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'triage item not found or already handled'
    })
  }

  return { ok: true }
})
