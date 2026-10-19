// Mark an expense as "no receipt needed" (or undo that). Some bookings never
// come with a Beleg, e.g. rent covered by a contract, and without this flag
// they would block the tax export forever. The tax report skips waived
// expenses in its missing-receipt list but keeps them in the journal.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)
  const body = await readBody<{ waived?: unknown }>(event).catch(() => ({}) as { waived?: unknown })
  if (typeof body?.waived !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'waived must be a boolean' })
  }

  const db = useDb()
  const info = db
    .prepare('UPDATE expenses SET receipt_waived = ? WHERE id = ?')
    .run(body.waived ? 1 : 0, id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { ok: true, waived: body.waived }
})
