// History of every Mahnung sent for a single invoice. Drives the
// expandable row on the Mahnungen page so the user can see what was
// already sent and when.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  return useDb()
    .prepare(
      `SELECT id, level, sent_at, subject, body
       FROM invoice_reminders WHERE invoice_id = ?
       ORDER BY sent_at DESC`
    )
    .all(id)
})
