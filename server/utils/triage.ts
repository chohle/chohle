// Inbound triage: the holding area for synced inbound mail that doesn't thread
// to any project (no In-Reply-To / References match against a Message-ID we
// captured). Rather than dropping it — losing cold inbound and header-stripped
// replies — the sync drivers park it here with a SUGGESTED project derived from
// the sender address. The suggestion is never auto-applied; a human assigns it
// from the triage UI. This preserves the zero-mis-file guarantee: nothing
// attaches to a project automatically except a real header-threaded reply.

import type { Database } from 'better-sqlite3'

export interface TriageInput {
  mailboxId: number
  messageId: string | null
  inReplyTo: string | null
  referencesIds: string | null
  fromAddress: string | null
  toAddress: string | null
  subject: string
  bodyHtml: string
  bodyText: string
  sentAt: string
}

// Pull the bare address out of a "Display Name <a@b.com>" (or already-bare)
// From header, validating it looks like an email.
export function extractEmail(addr: string | null): string | null {
  if (!addr) return null
  const angled = addr.match(/<([^>]+)>/)
  const raw = (angled?.[1] ?? addr).trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null
}

// Every inbound Message-ID we've already handled — attached to a project OR
// already sitting in triage (any status). The sync drivers seed their dedup
// set from this so a message is processed once and tombstoned rows (assigned /
// dismissed) never reappear.
export function loadHandledInboundIds(db: Database): Set<string> {
  const rows = db
    .prepare(
      `SELECT message_id FROM project_emails WHERE direction = 'inbound' AND message_id IS NOT NULL
       UNION
       SELECT message_id FROM inbound_triage WHERE message_id IS NOT NULL`
    )
    .all() as Array<{ message_id: string }>
  return new Set(rows.map((r) => r.message_id))
}

// Suggest a project for an unmatched inbound from its sender address. Exact
// (case-insensitive) email match against customers only — never fuzzy, never
// auto-applied. Prefers a single non-completed project, else the most recently
// touched one. Returns nulls when the sender is unknown or has no projects.
export function suggestProject(
  db: Database,
  fromAddress: string | null
): { customerId: number | null; projectId: number | null } {
  const email = extractEmail(fromAddress)
  if (!email) return { customerId: null, projectId: null }

  const customer = db
    .prepare(`SELECT id FROM customers WHERE lower(email) = lower(?) LIMIT 1`)
    .get(email) as { id: number } | undefined
  if (!customer) return { customerId: null, projectId: null }

  const project = db
    .prepare(
      `SELECT id FROM projects WHERE customer_id = ?
       ORDER BY (stage = 'completed') ASC, updated_at DESC LIMIT 1`
    )
    .get(customer.id) as { id: number } | undefined

  return { customerId: customer.id, projectId: project?.id ?? null }
}

// Park an unmatched inbound message in the triage queue with its suggestion.
// OR IGNORE on the unique message_id index makes this idempotent across
// overlapping runs. Returns 'duplicate' when the row already existed.
export function triageInbound(db: Database, input: TriageInput): 'triaged' | 'duplicate' {
  const { customerId, projectId } = suggestProject(db, input.fromAddress)
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO inbound_triage
         (mailbox_id, message_id, in_reply_to, references_ids, from_address, to_address,
          subject, body_html, body_text, sent_at, suggested_customer_id, suggested_project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.mailboxId,
      input.messageId,
      input.inReplyTo,
      input.referencesIds,
      input.fromAddress,
      input.toAddress,
      input.subject,
      input.bodyHtml,
      input.bodyText,
      input.sentAt,
      customerId,
      projectId
    )
  return info.changes > 0 ? 'triaged' : 'duplicate'
}

// Strip leading Re:/Fwd:/Aw:/Wg: so a reply groups with the message it answers.
// Server-side mirror of the client's stripRePrefix (app/utils/emailThreads.ts).
export function stripReplyPrefix(subject: string | null | undefined): string {
  let s = (subject ?? '').trim()
  while (/^(re|fwd|fw|aw|wg)\s*:\s*/i.test(s)) {
    s = s.replace(/^(re|fwd|fw|aw|wg)\s*:\s*/i, '').trim()
  }
  return s
}
