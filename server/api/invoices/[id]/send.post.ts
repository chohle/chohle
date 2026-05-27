import { isIBANValid } from 'swissqrbill/utils'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Wrap the composed body in a simple inline-styled shell with a header and footer.
function buildHtml(bodyHtml: string, sender: { name: string, phone: string | null, email: string | null, website: string | null, mwst: string | null }) {
  const footer = [sender.phone, sender.email, sender.website, sender.mwst].filter(Boolean).join(' &middot; ')
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1b1b1b;max-width:600px;margin:0 auto;padding:24px">`
    + `<div style="font-size:18px;font-weight:bold;border-bottom:1px solid #eaeaea;padding-bottom:12px;margin-bottom:20px">${escapeHtml(sender.name)}</div>`
    + `<div style="font-size:14px;line-height:1.5">${bodyHtml}</div>`
    + (footer ? `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #eaeaea;font-size:12px;color:#888">${footer}</div>` : '')
    + `</div>`
}

function htmlToText(html: string) {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>(?!$)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const { subject, message } = await readBody(event)
  if (!subject?.trim() || !message?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Subject and message are required' })
  }

  const db = useDb()
  const invoice = db.prepare('SELECT id, customer_id, number FROM invoices WHERE id = ?').get(id) as
    | { customer_id: number, number: string }
    | undefined
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })

  const customer = db
    .prepare('SELECT name, email FROM customers WHERE id = ?')
    .get(invoice.customer_id) as { name: string, email: string | null } | undefined
  if (!customer?.email) {
    throw createError({ statusCode: 422, statusMessage: 'Customer has no email address' })
  }

  const sender = db
    .prepare('SELECT name, email, phone, website, mwst, iban, street, zip, city FROM sender WHERE id = 1')
    .get() as { name: string, email: string | null, phone: string | null, website: string | null, mwst: string | null, iban: string | null, street: string | null, zip: string | null, city: string | null } | undefined
  const iban = (sender?.iban ?? '').replace(/\s/g, '')
  if (!sender || !isIBANValid(iban)) {
    throw createError({ statusCode: 422, statusMessage: 'Set a valid IBAN in Billing to send the invoice' })
  }
  if (!sender.name || !sender.street || !sender.zip || !sender.city) {
    throw createError({ statusCode: 422, statusMessage: 'Complete your sender address in Billing' })
  }

  const pdf = await generateInvoicePdf(id)

  const from = sender.email ? `${sender.name} <${sender.email}>` : `${sender.name} <no-reply@batze.local>`
  await getMailer().sendMail({
    from,
    to: customer.email,
    subject,
    text: htmlToText(message),
    html: buildHtml(message, sender),
    attachments: [
      { filename: `${invoice.number || 'invoice'}.pdf`, content: pdf, contentType: 'application/pdf' }
    ]
  })

  db.prepare("UPDATE invoices SET status = 'sent', paid_at = NULL, total_rappen = NULL WHERE id = ?").run(id)
  return { ok: true }
})
