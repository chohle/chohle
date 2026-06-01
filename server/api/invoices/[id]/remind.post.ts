// Sends an overdue payment reminder (Mahnung) for an invoice.
//
// Auto-picks the next level (1 / 2 / 3) based on how many reminders
// were already sent, unless the caller overrides via body.level. Same
// email send pipeline as /send.post (PDF attachment, sender footer),
// but uses the level-specific subject + body template from sender.
// Logs to invoice_reminders so eligibility + history can be derived.
//
// Caller can request a `previewOnly` render to get the rendered
// subject + body without sending; used by the Mahnungen page modal.

import { isIBANValid } from 'swissqrbill/utils'
import {
  type ReminderLevel,
  type SenderReminderConfig,
  nextLevel,
  renderTemplate,
  reminderState,
  templateFor,
  daysBetween
} from '~~/server/utils/reminders'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(
  bodyHtml: string,
  sender: {
    name: string
    phone: string | null
    email: string | null
    website: string | null
    mwst: string | null
  }
) {
  const footer = [sender.phone, sender.email, sender.website, sender.mwst]
    .filter(Boolean)
    .join(' &middot; ')
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1b1b1b;max-width:600px;margin:0 auto;padding:24px">` +
    `<div style="font-size:18px;font-weight:bold;border-bottom:1px solid #eaeaea;padding-bottom:12px;margin-bottom:20px">${escapeHtml(sender.name)}</div>` +
    `<div style="font-size:14px;line-height:1.5">${bodyHtml}</div>` +
    (footer
      ? `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #eaeaea;font-size:12px;color:#888">${footer}</div>`
      : '') +
    `</div>`
  )
}

function htmlToText(html: string) {
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>(?!$)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function chf(rappen: number): string {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

interface Body {
  level?: number
  previewOnly?: boolean
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const body = (await readBody<Body>(event).catch(() => ({}))) ?? {}
  const previewOnly = body.previewOnly === true

  const db = useDb()
  const invoice = db
    .prepare(
      `SELECT id, customer_id, number, issue_date, due_date, status, total_rappen
       FROM invoices WHERE id = ?`
    )
    .get(id) as
    | {
        customer_id: number
        number: string
        issue_date: string
        due_date: string
        status: string
        total_rappen: number | null
      }
    | undefined
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })

  if (invoice.status === 'paid') {
    throw createError({ statusCode: 422, statusMessage: 'Invoice is already paid' })
  }
  if (invoice.status !== 'sent') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Send the invoice first before sending a reminder'
    })
  }
  if (!invoice.due_date) {
    throw createError({ statusCode: 422, statusMessage: 'Invoice has no due date' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const daysOverdue = daysBetween(invoice.due_date, today)
  if (daysOverdue <= 0) {
    throw createError({ statusCode: 422, statusMessage: 'Invoice is not yet overdue' })
  }

  const customer = db
    .prepare('SELECT name, email FROM customers WHERE id = ?')
    .get(invoice.customer_id) as { name: string; email: string | null } | undefined
  if (!customer?.email) {
    throw createError({ statusCode: 422, statusMessage: 'Customer has no email address' })
  }

  const sender = db
    .prepare(
      `SELECT name, email, phone, website, mwst, iban, street, zip, city, vat_registered,
              reminder1_wait_days, reminder1_subject, reminder1_body,
              reminder2_wait_days, reminder2_subject, reminder2_body,
              reminder3_wait_days, reminder3_subject, reminder3_body
       FROM sender WHERE id = 1`
    )
    .get() as
    | ({
        name: string
        email: string | null
        phone: string | null
        website: string | null
        mwst: string | null
        iban: string | null
        street: string | null
        zip: string | null
        city: string | null
        vat_registered: number
      } & SenderReminderConfig)
    | undefined
  const iban = (sender?.iban ?? '').replace(/\s/g, '')
  if (!sender || !isIBANValid(iban)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Set a valid IBAN in Billing to send a reminder'
    })
  }
  if (!sender.name || !sender.street || !sender.zip || !sender.city) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Complete your sender address in Billing'
    })
  }

  // Pick level: explicit override (clamped to 1..3), or next slot.
  // We intentionally do NOT call isLevelDue here: explicit body.level is
  // a documented escalate/resend escape hatch. The UI only surfaces Send
  // for eligible rows, and the per-day dedupe below blocks the
  // accidental double-click case.
  const state = reminderState(db, id)
  const chosen: ReminderLevel | null =
    body.level === 1 || body.level === 2 || body.level === 3
      ? (body.level as ReminderLevel)
      : nextLevel(state.count)
  if (chosen === null) {
    throw createError({
      statusCode: 422,
      statusMessage: 'All three reminder levels have already been sent'
    })
  }

  // Same-day dedupe: if a reminder for this invoice + level was already
  // logged today, refuse so a double-click or page reload can't fire a
  // second email. SQLite's date() strips the time portion.
  if (!previewOnly) {
    const dupe = db
      .prepare(
        `SELECT 1 FROM invoice_reminders
         WHERE invoice_id = ? AND level = ? AND date(sent_at) = date('now')
         LIMIT 1`
      )
      .get(id, chosen)
    if (dupe) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A reminder at this level was already sent today'
      })
    }
  }

  // total_rappen is a denormalized cache that's nullable: /send.post.ts
  // even sets it to NULL on send. Fall back to a live compute from
  // invoice_items so the rendered {amount} placeholder is never CHF 0.
  let totalRappen = invoice.total_rappen
  if (totalRappen == null) {
    const lines = db
      .prepare(
        `SELECT quantity, unit_price_rappen, discount_percent, mwst_percent
         FROM invoice_items WHERE invoice_id = ?`
      )
      .all(id) as Array<{
      quantity: number
      unit_price_rappen: number
      discount_percent: number
      mwst_percent: number
    }>
    totalRappen = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPriceRappen: l.unit_price_rappen,
        discountPercent: l.discount_percent,
        mwstPercent: l.mwst_percent
      })),
      !!sender.vat_registered
    ).totalRappen
  }

  const tpl = templateFor(chosen, sender)
  const subject = renderTemplate(tpl.subject, {
    customerName: customer.name,
    invoiceNumber: invoice.number,
    amountChf: chf(totalRappen),
    issuedDate: invoice.issue_date,
    dueDate: invoice.due_date,
    daysOverdue,
    senderName: sender.name
  })
  const renderedBody = renderTemplate(tpl.body, {
    customerName: customer.name,
    invoiceNumber: invoice.number,
    amountChf: chf(totalRappen),
    issuedDate: invoice.issue_date,
    dueDate: invoice.due_date,
    daysOverdue,
    senderName: sender.name
  })

  if (previewOnly) {
    return { ok: true, level: chosen, subject, body: renderedBody, daysOverdue }
  }

  const pdf = await generateInvoicePdf(id)
  const from = sender.email
    ? `${sender.name} <${sender.email}>`
    : `${sender.name} <no-reply@chohle.local>`
  await getMailer().sendMail({
    from,
    to: customer.email,
    subject,
    text: htmlToText(renderedBody),
    html: buildHtml(renderedBody, sender),
    attachments: [
      {
        filename: `${invoice.number || 'invoice'}.pdf`,
        content: pdf,
        contentType: 'application/pdf'
      }
    ]
  })

  const info = db
    .prepare(`INSERT INTO invoice_reminders (invoice_id, level, subject, body) VALUES (?, ?, ?, ?)`)
    .run(id, chosen, subject, renderedBody)

  return {
    ok: true,
    level: chosen,
    reminderId: Number(info.lastInsertRowid),
    sentAt: new Date().toISOString()
  }
})
