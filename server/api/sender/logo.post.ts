export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  // PNG only: the logo is embedded in the invoice/quote PDF, where PNG renders
  // reliably and keeps transparency. Other raster types are rejected here.
  const storedName = await saveImageUpload(event, ['image/png'])

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  const current = db.prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
    | { logo_path: string | null }
    | undefined
  await deleteUpload(current?.logo_path)
  db.prepare('UPDATE sender SET logo_path = ? WHERE id = 1').run(storedName)

  return { ok: true }
})
