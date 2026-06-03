// Create a signature. The very first one (or one explicitly flagged) becomes
// the default; setting a default clears the flag on the others.
interface Body {
  name?: string
  content_html?: string
  is_default?: boolean
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<Body>(event)
  const name = (body.name ?? '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name required' })
  }
  const content = body.content_html ?? ''
  const db = useDb()
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM signatures`).get() as { n: number }).n
  const makeDefault = body.is_default === true || count === 0

  const id = db.transaction(() => {
    if (makeDefault) db.prepare(`UPDATE signatures SET is_default = 0`).run()
    const info = db
      .prepare(`INSERT INTO signatures (name, content_html, is_default) VALUES (?, ?, ?)`)
      .run(name, content, makeDefault ? 1 : 0)
    return Number(info.lastInsertRowid)
  })()
  return { id }
})
