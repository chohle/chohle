export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { currentPassword, newPassword } = await readBody(event)
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'New password must be at least 8 characters' })
  }

  const db = useDb()
  const owner = db.prepare('SELECT password_hash FROM owner WHERE id = 1').get() as
    | { password_hash: string }
    | undefined
  if (!owner || !(await verifyPassword(owner.password_hash, currentPassword))) {
    throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' })
  }

  const hash = await hashPassword(newPassword)
  db.prepare('UPDATE owner SET password_hash = ? WHERE id = 1').run(hash)
  return { ok: true }
})
