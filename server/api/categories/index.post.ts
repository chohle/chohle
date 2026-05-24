export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const name = (body?.name ?? '').trim()
  const { type, color, icon } = body ?? {}

  if (!name || !['expense', 'income'].includes(type) || !color || !icon) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
  }

  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)')
    .run(name, type, color, icon)

  return { id: lastInsertRowid, name, type, color, icon }
})