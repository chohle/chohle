export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  useDb().prepare(`DELETE FROM deals WHERE id = ?`).run(id)
  return { ok: true }
})
