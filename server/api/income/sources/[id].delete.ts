export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  useDb().prepare('DELETE FROM income_sources WHERE id = ?').run(id)
  return { ok: true }
})
