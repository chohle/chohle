// Manually log a reply the user received in their normal mailbox.
// No SMTP send happens — we just record what they pasted.

interface Body {
  subject?: string
  from?: string
  body_text?: string
  body_html?: string
  sent_at?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const body = await readBody<Body>(event)
  const subject = (body.subject ?? '').trim()
  const html = (body.body_html ?? '').trim()
  const text = (body.body_text ?? '').trim()
  const from = (body.from ?? '').trim() || null
  if (!subject && !text && !html) {
    throw createError({ statusCode: 400, statusMessage: 'paste at least a subject or body' })
  }

  const db = useDb()
  const exists = db.prepare(`SELECT id FROM deals WHERE id = ?`).get(id)
  if (!exists) throw createError({ statusCode: 404, statusMessage: 'deal not found' })

  const sentAt = body.sent_at && /^\d{4}-\d{2}-\d{2}/.test(body.sent_at)
    ? body.sent_at
    : new Date().toISOString().replace('T', ' ').slice(0, 19)

  const info = db.prepare(
    `INSERT INTO deal_emails (deal_id, direction, from_address, to_address, subject, body_html, body_text, sent_at)
     VALUES (?, 'inbound', ?, NULL, ?, ?, ?, ?)`
  ).run(id, from, subject, html, text, sentAt)

  return { id: info.lastInsertRowid }
})
