export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  const row = db.prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
    | { logo_path: string | null }
    | undefined
  await deleteUpload(row?.logo_path)
  db.prepare('UPDATE sender SET logo_path = NULL WHERE id = 1').run()

  return { ok: true }
})
