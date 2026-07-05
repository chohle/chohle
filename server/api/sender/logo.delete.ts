export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  return removeLogo('sender', 1)
})
