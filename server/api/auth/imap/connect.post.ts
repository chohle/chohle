// Connect an IMAP mailbox. Unlike Outlook and Gmail there's no OAuth
// round-trip; the user supplies host/port/user/password directly. We
// verify the credentials by opening a real IMAP session (login +
// open INBOX read-only) before persisting, so we never store a
// configuration that we already know is broken.

import { lookup } from 'node:dns/promises'
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

// SSRF guard: a user supplies the IMAP host, which we then dial (here and
// on every scheduled sync). Block loopback, link-local (incl. the cloud
// metadata endpoint) and private ranges so the host can't be aimed at
// internal services. Self-hosters with a LAN/Docker mail server can opt
// out with IMAP_ALLOW_PRIVATE_HOSTS=1.
function isBlockedV4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  // Defaults are inert (length is already 4 here) but tell TS a/b are defined.
  const [a = 0, b = 0] = p
  if (a === 0 || a === 127) return true // unspecified / loopback
  if (a === 169 && b === 254) return true // link-local + 169.254.169.254 metadata
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  return false
}

function isBlockedIp(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v.includes(':')) {
    if (v === '::' || v === '::1') return true // unspecified / loopback
    if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb'))
      return true // fe80::/10 link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true // fc00::/7 unique-local
    const mapped = v.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isBlockedV4(mapped[1]!)
    return false
  }
  return isBlockedV4(v)
}

async function assertConnectableHost(host: string): Promise<void> {
  if (
    process.env.IMAP_ALLOW_PRIVATE_HOSTS === '1' ||
    process.env.IMAP_ALLOW_PRIVATE_HOSTS === 'true'
  )
    return
  const addrs = await lookup(host, { all: true }).catch(() => [] as { address: string }[])
  if (addrs.length === 0) {
    throw createError({ statusCode: 400, statusMessage: `Could not resolve IMAP host: ${host}` })
  }
  if (addrs.some((a) => isBlockedIp(a.address))) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'IMAP host resolves to a private or loopback address. Set IMAP_ALLOW_PRIVATE_HOSTS=1 to allow a local/LAN mail server.'
    })
  }
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  if (!secretIsAvailable()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CHOHLE_SECRET environment variable must be set before connecting a mailbox'
    })
  }

  const body = await readBody<Body>(event)
  const host = (body.host ?? '').trim()
  const port = Number(body.port ?? 993)
  const user = (body.user ?? '').trim()
  const password = body.password ?? ''
  const label = (body.label ?? '').trim()
  const emailAddress = (body.emailAddress ?? user) || null

  if (!host) throw createError({ statusCode: 400, statusMessage: 'host is required' })
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createError({
      statusCode: 400,
      statusMessage: 'port must be an integer between 1 and 65535'
    })
  }
  if (!user) throw createError({ statusCode: 400, statusMessage: 'user is required' })
  if (!password) throw createError({ statusCode: 400, statusMessage: 'password is required' })

  await assertConnectableHost(host)

  // 993 is the IANA assigned port for IMAPS (implicit TLS). For other
  // ports doSTARTTLS forces a STARTTLS upgrade and fails the connection
  // if the server can't (or a MITM stripped it), so the password is never
  // sent over cleartext. servername sets the SNI/cert-validation host.
  const secure = port === 993
  const client = new ImapFlow({
    host,
    port,
    secure,
    // STARTTLS only applies to plaintext (non-implicit-TLS) connections;
    // setting it alongside secure=true is rejected as a misconfiguration.
    doSTARTTLS: !secure,
    servername: host,
    auth: { user, pass: password },
    logger: false
  })

  try {
    await client.connect()
    // Open read only just to confirm the account can actually see an
    // INBOX. Bad credentials throw at connect(); a sane account with
    // no INBOX would throw here.
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    lock.release()
  } catch (err) {
    const msg =
      (err as { responseText?: string; message?: string }).responseText ??
      (err as { message?: string }).message ??
      'IMAP login failed'
    throw createError({ statusCode: 401, statusMessage: msg, cause: err })
  } finally {
    try {
      await client.logout()
    } catch {
      /* ignore */
    }
  }

  const id = insertImapMailbox(useDb(), {
    label,
    emailAddress,
    host,
    port,
    user,
    password
  })

  return { ok: true, id }
})
