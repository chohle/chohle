export default defineEventHandler(async (event) => {
  const { username, password } = await readBody(event)
  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Missing credentials' })
  }

  const owner = useDb()
    .prepare('SELECT username, password_hash, locale FROM owner WHERE id = 1')
    .get() as { username: string; password_hash: string; locale: string } | undefined

  const valid =
    owner && owner.username === username && (await verifyPassword(owner.password_hash, password))
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, { user: { username: owner.username, locale: owner.locale } })
  return { ok: true }
})
