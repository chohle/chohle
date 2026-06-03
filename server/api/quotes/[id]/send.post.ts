// Email a quote PDF to the customer. Mirrors /invoices/[id]/send.post
// minus the IBAN gate (a quote isn't a payment instrument so no QR
// slip and no IBAN dependency). Marks the quote as 'sent' on success.

// HTML shell, plaintext, and the contact footer come from the shared branded
// template (server/utils/emailTemplate.ts), auto-imported, so every outbound
// email looks identical.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const { subject, message, signature_id } = await readBody(event)
  if (!subject?.trim() || !message?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Subject and message are required' })
  }

  const db = useDb()
  const quote = db
    .prepare(
      'SELECT id, customer_id, number, status, converted_invoice_id FROM quotes WHERE id = ?'
    )
    .get(id) as
    | {
        customer_id: number
        number: string
        status: string
        converted_invoice_id: number | null
      }
    | undefined
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })

  // Refuse send on terminal states. Declined is a hard no (sending would
  // regress the status). Converted means an invoice already exists; the
  // user should send that instead. Draft / sent / accepted may all be
  // sent (accepted is allowed so "confirmation" resends work).
  if (quote.status === 'declined') {
    throw createError({ statusCode: 409, statusMessage: 'Cannot send a declined quote' })
  }
  if (quote.converted_invoice_id) {
    throw createError({
      statusCode: 409,
      statusMessage: `Quote already converted to invoice ${quote.converted_invoice_id}; send the invoice instead`
    })
  }

  const customer = db
    .prepare('SELECT name, email FROM customers WHERE id = ?')
    .get(quote.customer_id) as { name: string; email: string | null } | undefined
  if (!customer?.email) {
    throw createError({ statusCode: 422, statusMessage: 'Customer has no email address' })
  }

  const sender = db
    .prepare('SELECT name, email, phone, website, mwst, logo_path FROM sender WHERE id = 1')
    .get() as
    | {
        name: string
        email: string | null
        phone: string | null
        website: string | null
        mwst: string | null
        logo_path: string | null
      }
    | undefined
  if (!sender?.name) {
    throw createError({ statusCode: 422, statusMessage: 'Set your sender name in Billing' })
  }

  const pdf = await generateQuotePdf(id)

  const from = sender.email
    ? `${sender.name} <${sender.email}>`
    : `${sender.name} <no-reply@chohle.local>`
  let signatureHtml: string | undefined
  if (Number.isInteger(Number(signature_id))) {
    const sig = db
      .prepare(`SELECT content_html FROM signatures WHERE id = ?`)
      .get(Number(signature_id)) as { content_html: string } | undefined
    signatureHtml = sig?.content_html || undefined
  }
  const { html, text } = await buildBrandedEmail(sender, message, { signatureHtml })
  await getMailer().sendMail({
    from,
    to: customer.email,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `${quote.number || 'quote'}.pdf`,
        content: pdf,
        contentType: 'application/pdf'
      }
    ]
  })

  // Only promote draft -> sent. A resend from sent stays sent; a resend
  // from accepted preserves the accepted state (so the workflow isn't
  // regressed by a confirmation email going out).
  if (quote.status === 'draft') {
    db.prepare("UPDATE quotes SET status = 'sent' WHERE id = ?").run(id)
  }
  return { ok: true }
})
