export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const c = parseCategory(await readBody(event))
  const { changes } = useDb()
    .prepare('UPDATE categories SET name = ?, type = ?, color = ?, icon = ? WHERE id = ?')
    .run(c.name, c.type, c.color, c.icon, id)

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})
