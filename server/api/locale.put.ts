const SUPPORTED = ['en', 'de', 'fr', 'it']

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { locale } = await readBody(event)

  if (!SUPPORTED.includes(locale)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported locale' })
  }

  useDb().prepare('UPDATE owner SET locale = ? WHERE id = 1').run(locale)
  await setUserSession(event, { user: { ...session.user, locale } })
  return { ok: true }
})
