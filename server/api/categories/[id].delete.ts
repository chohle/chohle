export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  useDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
  return { ok: true }
})
