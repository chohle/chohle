export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const c = parseCategory(await readBody(event))
  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)')
    .run(c.name, c.type, c.color, c.icon)

  return { id: lastInsertRowid, ...c }
})