export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return useDb()
    .prepare('SELECT id, name, unit, default_price_rappen, default_mwst FROM articles ORDER BY name')
    .all()
})