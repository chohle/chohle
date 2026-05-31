interface Body {
  subject?: string
  to?: string
  body_html?: string
}

interface SenderRow {
  email: string | null
  name: string
}
interface ProjectRow {
  id: number
  customer_id: number | null
}
interface CustomerRow {
  email: string | null
}

function htmlToText(html: string): string {
  // Tiny stripper for plaintext fallback. Good enough for email clients
  // that fall back when there's no text/plain part.
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
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
  if (!subject || !html) {
    throw createError({ statusCode: 400, statusMessage: 'subject and body required' })
  }

  const db = useDb()
  const project = db.prepare(`SELECT id, customer_id FROM projects WHERE id = ?`).get(id) as
    | ProjectRow
    | undefined
  if (!project) throw createError({ statusCode: 404, statusMessage: 'project not found' })

  // Resolve the recipient: explicit body.to wins, otherwise pull from the
  // linked customer record so the UI can default-fill the field.
  let to = (body.to ?? '').trim()
  if (!to && project.customer_id) {
    const c = db.prepare(`SELECT email FROM customers WHERE id = ?`).get(project.customer_id) as
      | CustomerRow
      | undefined
    if (c?.email) to = c.email
  }
  if (!to) {
    throw createError({ statusCode: 400, statusMessage: 'recipient address required' })
  }

  const sender = db.prepare(`SELECT email, name FROM sender WHERE id = 1`).get() as
    | SenderRow
    | undefined
  if (!sender?.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'configure a sender email in Billing first'
    })
  }

  // Pass the address object form so nodemailer encodes display names with
  // special characters (quotes, commas, non-ASCII) into a valid RFC 5322 header.
  const from = sender.name ? { name: sender.name, address: sender.email } : sender.email
  const text = htmlToText(html)

  // nodemailer returns the Message-ID it assigned (or that the SMTP server
  // assigned). We persist it so the sync worker can thread inbound replies
  // by matching their In-Reply-To / References headers against it.
  let messageId: string | null = null
  try {
    const sendInfo = await getMailer().sendMail({ from, to, subject, html, text })
    messageId = (sendInfo as { messageId?: string }).messageId?.replace(/^<|>$/g, '') ?? null
  } catch (err) {
    throw createError({ statusCode: 502, statusMessage: 'SMTP send failed', cause: err })
  }

  const info = db
    .prepare(
      `INSERT INTO project_emails (project_id, direction, from_address, to_address, subject, body_html, body_text, message_id)
     VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?)`
    )
    .run(id, sender.email, to, subject, html, text, messageId)

  return { id: info.lastInsertRowid }
})
