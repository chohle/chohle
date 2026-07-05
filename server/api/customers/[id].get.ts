export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  const customer = useDb().prepare('SELECT * FROM customers WHERE id = ?').get(id)
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return customer
})
