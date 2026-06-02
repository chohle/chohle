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

// Single shared SMTP transport, configured from runtimeConfig (Mailpit in dev).
export function getMailer(): Transporter {
  if (isDemo()) return getDemoMailer()
  if (transporter) return transporter

  const { smtp } = useRuntimeConfig()
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: false
  })
  return transporter
}
