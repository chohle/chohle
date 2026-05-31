import nodemailer, { type Transporter } from 'nodemailer'

let transporter: Transporter | null = null

// Single shared SMTP transport, configured from runtimeConfig (Mailpit in dev).
export function getMailer(): Transporter {
  if (transporter) return transporter

  const { smtp } = useRuntimeConfig()
  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: false
  })
  return transporter
}
