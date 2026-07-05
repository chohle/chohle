export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)
  return serveLogo(event, 'customers', id)
})
