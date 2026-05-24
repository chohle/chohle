export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const storedName = await saveImageUpload(event)

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  const current = db.prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
    | { logo_path: string | null }
    | undefined
  await deleteUpload(current?.logo_path)
  db.prepare('UPDATE sender SET logo_path = ? WHERE id = 1').run(storedName)

  return { ok: true }
})
