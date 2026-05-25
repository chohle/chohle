import { isIBANValid } from 'swissqrbill/utils'

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
    .prepare('SELECT name, email, iban, street, zip, city FROM sender WHERE id = 1')
    .get() as { name: string, email: string | null, iban: string | null, street: string | null, zip: string | null, city: string | null } | undefined
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
    text: message,
    attachments: [
      { filename: `${invoice.number || 'invoice'}.pdf`, content: pdf, contentType: 'application/pdf' }
    ]
  })

  db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(id)
  return { ok: true }
})
