export default defineNitroPlugin(async () => {
  const db = useDb()
  const exists = db.prepare('SELECT 1 FROM owner WHERE id = 1').get()
  if (exists) return

  const { adminUsername, adminPassword } = useRuntimeConfig()
  if (!adminUsername || !adminPassword) return

  const hash = await hashPassword(adminPassword)
  db.prepare('INSERT INTO owner (id, username, password_hash) VALUES (1, ?, ?)').run(
    adminUsername,
    hash
  )
  console.log('[auth] seeded owner account')
})
