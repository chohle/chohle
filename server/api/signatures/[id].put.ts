// Update a signature. Making it default clears the flag on the others.
interface Body {
  name?: string
  content_html?: string
  is_default?: boolean
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const body = await readBody<Body>(event)
  const name = (body.name ?? '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name required' })
  }
  const content = body.content_html ?? ''
  const makeDefault = body.is_default === true

  const db = useDb()
  const exists = db.prepare(`SELECT id FROM signatures WHERE id = ?`).get(id)
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'signature not found' })
  }

  db.transaction(() => {
    if (makeDefault) db.prepare(`UPDATE signatures SET is_default = 0`).run()
    db.prepare(`UPDATE signatures SET name = ?, content_html = ?, is_default = ? WHERE id = ?`).run(
      name,
      content,
      makeDefault ? 1 : 0,
      id
    )
  })()
  return { ok: true }
})
