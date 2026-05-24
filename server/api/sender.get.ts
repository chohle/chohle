export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  return db.prepare('SELECT * FROM sender WHERE id = 1').get()
})