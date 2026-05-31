export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const { template } = await readBody(event)
  if (typeof template !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid template' })
  }

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare('UPDATE sender SET email_template = ? WHERE id = 1').run(template)
  return { ok: true }
})
