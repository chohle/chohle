// Update a document: title, content (TipTap JSON), and/or the attach toggle.
interface Body {
  title?: string
  content?: unknown
  attach?: boolean
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const quoteId = Number(getRouterParam(event, 'id'))
  const docId = Number(getRouterParam(event, 'docId'))
  if (!Number.isInteger(quoteId) || !Number.isInteger(docId)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const db = useDb()
  const row = db
    .prepare('SELECT id FROM quote_documents WHERE id = ? AND quote_id = ?')
    .get(docId, quoteId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'document not found' })

  const body = await readBody<Body>(event)
  const sets: string[] = []
  const vals: unknown[] = []
  if (typeof body.title === 'string') {
    sets.push('title = ?')
    vals.push(body.title.trim() || 'Dokument')
  }
  if (body.content !== undefined) {
    sets.push('content = ?')
    vals.push(JSON.stringify(body.content))
  }
  if (typeof body.attach === 'boolean') {
    sets.push('attach = ?')
    vals.push(body.attach ? 1 : 0)
  }
  if (!sets.length) return { ok: true }
  sets.push("updated_at = datetime('now')")
  vals.push(docId)
  db.prepare(`UPDATE quote_documents SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return { ok: true }
})
