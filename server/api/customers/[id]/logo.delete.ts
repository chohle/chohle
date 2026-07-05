export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)
  return removeLogo('customers', id)
})
