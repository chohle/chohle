export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const customer = useDb().prepare('SELECT * FROM customers WHERE id = ?').get(id)
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return customer
})
