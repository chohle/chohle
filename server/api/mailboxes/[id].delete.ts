export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  // We don't revoke at the provider side; user can do that from their
  // account dashboard if they want. We just forget the tokens.
  const { changes } = useDb().prepare(`DELETE FROM mailboxes WHERE id = ?`).run(id)
  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'mailbox not found' })
  }
  return { ok: true }
})
