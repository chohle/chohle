// Shared helpers for the outbound-mail endpoints (invoice/quote sends,
// reminders, project replies, previews): building the From header, resolving
// an optional signature, and loading the Billing sender with a neutral
// fallback for previews.
import type { Database } from 'better-sqlite3'

// From header for outbound mail. Falls back to a Mailpit-safe local address
// when no sender email is configured in Billing.
export function senderFromAddress(sender: { name: string; email: string | null }): string {
  return `${sender.name} <${sender.email ?? 'no-reply@chohle.local'}>`
}

// Resolve an optional signature id (from an untyped request body) to its
// stored HTML for the branded template's signature slot; undefined when the
// id is missing, not a number, or unknown.
export function resolveSignatureHtml(db: Database, signature_id: unknown): string | undefined {
  if (!Number.isInteger(Number(signature_id))) return undefined
  const sig = db
    .prepare(`SELECT content_html FROM signatures WHERE id = ?`)
    .get(Number(signature_id)) as { content_html: string } | undefined
  return sig?.content_html || undefined
}

export interface EmailSenderRow {
  name: string
  email: string | null
  phone: string | null
  website: string | null
  mwst: string | null
  logo_path: string | null
}

// The Billing sender as the email preview endpoints need it, with a neutral
// fallback so the template renders before Billing is configured.
export function senderRowOrDefault(db: Database): EmailSenderRow {
  return (
    (db
      .prepare('SELECT name, email, phone, website, mwst, logo_path FROM sender WHERE id = 1')
      .get() as EmailSenderRow | null) ?? {
      name: 'chohle',
      email: null,
      phone: null,
      website: null,
      mwst: null,
      logo_path: null
    }
  )
}
