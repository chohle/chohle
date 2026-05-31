export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const row = db.prepare('SELECT logo_path FROM customers WHERE id = ?').get(id) as
    | { logo_path: string | null }
    | undefined
  await deleteUpload(row?.logo_path)
  db.prepare('UPDATE customers SET logo_path = NULL WHERE id = ?').run(id)

  return { ok: true }
})
