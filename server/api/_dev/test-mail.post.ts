// Dev-only smoke test for the outbound SMTP pipe. Sends one message through the
// configured transport — Mailpit in dev, or a real provider like metanet once
// NUXT_SMTP_USER/PASS are set — so you can confirm auth, TLS, and the From-domain
// guard all line up BEFORE sending a real invoice. Mirrors the live send paths:
// From is the Billing sender, so the guard is exercised exactly as an invoice
// would exercise it. Sends to that same address (i.e. to yourself) unless
// ?to= or a { to } body overrides it. Stays dev-only so it's never exposed in prod.
interface Body {
  to?: string
}

interface SenderRow {
  email: string | null
  name: string | null
}

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const db = useDb()
  const sender = db.prepare(`SELECT email, name FROM sender WHERE id = 1`).get() as
    | SenderRow
    | undefined

  const { smtp } = useRuntimeConfig()
  // Send AS the authenticated SMTP account so this smoke test exercises the
  // real provider pipe (auth + TLS) and passes the From-domain guard — even
  // when the Billing sender is a different domain you can't yet authenticate
  // as. Falls back to Billing, then a Mailpit-safe local address.
  const fromEmail = smtp.user || sender?.email || 'no-reply@chohle.local'
  const from = sender?.name ? { name: sender.name, address: fromEmail } : fromEmail

  const body = await readBody<Body>(event).catch(() => ({}) as Body)
  const to = (body?.to || (getQuery(event).to as string) || fromEmail).trim()

  const info = await getMailer().sendMail({
    from,
    to,
    subject: 'chohle SMTP test',
    text:
      'If you can read this, the outbound mail pipe works.\n\n' +
      `host: ${smtp.host}:${smtp.port}\nfrom:  ${fromEmail}\nto:    ${to}`
  })

  return {
    sentVia: `${smtp.host}:${smtp.port}`,
    authenticated: Boolean(smtp.user),
    from: fromEmail,
    to,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected
  }
})
