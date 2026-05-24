export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const current = db.prepare('SELECT logo_path FROM customers WHERE id = ?').get(id) as
    | { logo_path: string | null }
    | undefined
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const storedName = await saveImageUpload(event)
  await deleteUpload(current.logo_path)
  db.prepare('UPDATE customers SET logo_path = ? WHERE id = ?').run(storedName, id)

  return { ok: true }
})
