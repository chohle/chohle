export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const row = useDb().prepare('SELECT logo_path FROM customers WHERE id = ?').get(id) as
    | { logo_path: string | null }
    | undefined
  return serveUpload(event, row?.logo_path)
})
