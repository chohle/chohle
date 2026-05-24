export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return useDb()
    .prepare('SELECT id, name, type, color, icon FROM categories ORDER BY type, name')
    .all()
})