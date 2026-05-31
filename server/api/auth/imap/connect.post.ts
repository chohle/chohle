// Connect an IMAP mailbox. Unlike Outlook and Gmail there's no OAuth
// round-trip; the user supplies host/port/user/password directly. We
// verify the credentials by opening a real IMAP session (login +
// open INBOX read-only) before persisting, so we never store a
// configuration that we already know is broken.

import { ImapFlow } from 'imapflow'
import { insertImapMailbox } from '~~/server/utils/mailbox'
import { secretIsAvailable } from '~~/server/utils/secrets'

interface Body {
  host?: string
  port?: number
  user?: string
  password?: string
  label?: string
  emailAddress?: string | null
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  if (!secretIsAvailable()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'BATZE_SECRET environment variable must be set before connecting a mailbox'
    })
  }

  const body = await readBody<Body>(event)
  const host = (body.host ?? '').trim()
  const port = Number(body.port ?? 993)
  const user = (body.user ?? '').trim()
  const password = body.password ?? ''
  const label = (body.label ?? '').trim()
  const emailAddress = ((body.emailAddress ?? user) || null)

  if (!host) throw createError({ statusCode: 400, statusMessage: 'host is required' })
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createError({ statusCode: 400, statusMessage: 'port must be an integer between 1 and 65535' })
  }
  if (!user) throw createError({ statusCode: 400, statusMessage: 'user is required' })
  if (!password) throw createError({ statusCode: 400, statusMessage: 'password is required' })

  // 993 is the IANA assigned port for IMAPS (implicit TLS). For other
  // ports we let imapflow upgrade with STARTTLS when the server
  // advertises it; rejected if the server is plain text only.
  const secure = port === 993
  const client = new ImapFlow({
    host, port, secure,
    auth: { user, pass: password },
    logger: false
  })

  try {
    await client.connect()
    // Open read only just to confirm the account can actually see an
    // INBOX. Bad credentials throw at connect(); a sane account with
    // no INBOX would throw here.
    const lock = await client.getMailboxLock('INBOX', { readonly: true })
    lock.release()
  } catch (err) {
    const msg = (err as { responseText?: string; message?: string }).responseText
      ?? (err as { message?: string }).message
      ?? 'IMAP login failed'
    throw createError({ statusCode: 401, statusMessage: msg, cause: err })
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }

  const id = insertImapMailbox(useDb(), {
    label, emailAddress, host, port, user, password
  })

  return { ok: true, id }
})
