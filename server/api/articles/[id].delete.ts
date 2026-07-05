export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  useDb().prepare('DELETE FROM articles WHERE id = ?').run(id)
  return { ok: true }
})
