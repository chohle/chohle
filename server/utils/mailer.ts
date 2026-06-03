import nodemailer, { type Transporter } from 'nodemailer'
import { isDemo } from './demo'

let transporter: Transporter | null = null
let demoTransporter: Transporter | null = null

// In demo mode all outbound mail is swallowed — a public visitor must not be
// able to send real email (invoices, reminders, quotes) to arbitrary addresses.
function getDemoMailer(): Transporter {
  if (demoTransporter) return demoTransporter
  demoTransporter = {
    sendMail: async (opts: { to?: unknown; subject?: unknown }) => {
      console.log(
        `[demo] outbound email suppressed → ${String(opts?.to)}: "${String(opts?.subject)}"`
      )
      return {
        messageId: 'demo-suppressed',
        accepted: [],
        rejected: [],
        response: 'demo: not sent'
      }
    }
  } as unknown as Transporter
  return demoTransporter
}

// Pull the bare domain out of a nodemailer `from` (a "Name <a@b>" / "a@b"
// string, or an { address } object). Lower-cased; '' when none can be parsed.
function fromDomain(from: unknown): string {
  const raw = typeof from === 'string' ? from : (from as { address?: string })?.address
  const email = String(raw ?? '').match(/<([^>]+)>/)?.[1] ?? String(raw ?? '')
  return email.split('@')[1]?.trim().toLowerCase() ?? ''
}

// Guard: when we authenticate to a real SMTP account, the From must sit on the
// same domain we log in as — otherwise the provider (example et al.) rejects or
// rewrites it and the recipient's SPF/DKIM checks fail. This catches the exact
// mismatch of a Billing sender email that doesn't match NUXT_SMTP_USER. Wraps
// sendMail at the single choke point so every path (replies, invoices, quotes,
// reminders) is covered. No-op when no auth is configured (Mailpit dev relay).
function guardFromDomain(t: Transporter, smtpUser: string): Transporter {
  const expected = smtpUser.split('@')[1]?.trim().toLowerCase() ?? ''
  if (!expected) return t
  const send = t.sendMail.bind(t)
  t.sendMail = ((opts: Parameters<Transporter['sendMail']>[0]) => {
    const dom = fromDomain((opts as { from?: unknown })?.from)
    if (dom && dom !== expected) {
      const msg =
        `Refusing to send: From domain "@${dom}" does not match the SMTP ` +
        `account "@${expected}". Set the Billing sender email to an address ` +
        `on @${expected} (or point NUXT_SMTP_USER at the @${dom} mailbox).`
      console.error(`[mail] ${msg}`)
      throw new Error(msg)
    }
    return send(opts)
  }) as Transporter['sendMail']
  return t
}

// Single shared SMTP transport, configured from runtimeConfig (Mailpit in dev).
export function getMailer(): Transporter {
  if (isDemo()) return getDemoMailer()
  if (transporter) return transporter

  const { smtp } = useRuntimeConfig()
  const port = Number(smtp.port)
  // Port 465 speaks TLS from the first byte; 587/25/1025 connect plain and
  // upgrade via STARTTLS (secure: false). NUXT_SMTP_SECURE overrides when a
  // host needs something non-standard.
  const secure = smtp.secure ? smtp.secure === 'true' : port === 465

  const t = nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    // Only attach auth when credentials are set, so the no-auth Mailpit dev
    // relay keeps working untouched. The user is the full mailbox address.
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {})
  })
  // The presence of smtp.user IS the dev/prod switch: blank → Mailpit relay,
  // no auth, no From guard; set → real provider, authenticated + guarded.
  transporter = smtp.user ? guardFromDomain(t, smtp.user) : t
  return transporter
}
