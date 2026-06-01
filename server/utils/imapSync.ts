// Generic IMAP sync driver.
//
// Mirror of outlookSync.ts / gmailSync.ts but for plain IMAP servers
// (Proton Bridge, Fastmail, iCloud, custom). The sync worker calls
// `syncImapMailbox` per connected mailbox on a schedule, plus the
// manual "Sync now" endpoint. It opens a real IMAP session, searches
// the INBOX for messages newer than last_sync_at, parses each one with
// mailparser, and inserts the ones whose In-Reply-To / References
// match a Message-ID chohle previously captured on outbound.

import type { Database } from 'better-sqlite3'
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import { decryptSecret } from './secrets'
import type { SyncResult } from './mailbox'

interface ImapSyncMailbox {
  id: number
  provider: 'outlook' | 'gmail' | 'imap'
  email_address: string | null
  imap_host: string | null
  imap_port: number | null
  imap_user: string | null
  imap_password_enc: string | null
  last_sync_at: string | null
}

function stripAngles(id: string): string {
  return id.replace(/^<|>$/g, '').trim()
}

// mailparser returns references either as a single string or an array
// of strings, depending on how many ids were in the header. Normalise.
function asArray(refs: string | string[] | undefined): string[] {
  if (!refs) return []
  if (Array.isArray(refs)) return refs
  return refs.split(/\s+/)
}

export async function syncImapMailbox(db: Database, mailbox: ImapSyncMailbox): Promise<SyncResult> {
  if (
    !mailbox.imap_host ||
    !mailbox.imap_port ||
    !mailbox.imap_user ||
    !mailbox.imap_password_enc
  ) {
    throw new Error('mailbox missing IMAP credentials; reconnect required')
  }

  // First sync: look back 7 days. Otherwise resume from last_sync_at
  // minus 5 min overlap so a slow-clock reply doesn't slip through.
  // IMAP SEARCH SINCE is day-granular, so we round down to midnight
  // (the dedup catches any extra messages we re-fetch).
  const sinceMs = mailbox.last_sync_at
    ? new Date(mailbox.last_sync_at).getTime() - 5 * 60_000
    : Date.now() - 7 * 24 * 60 * 60 * 1000
  const since = new Date(sinceMs)

  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: mailbox.imap_port,
    secure: mailbox.imap_port === 993,
    requireTLS: true,
    servername: mailbox.imap_host,
    auth: { user: mailbox.imap_user, pass: decryptSecret(mailbox.imap_password_enc) },
    logger: false
  })

  // Pre-load every Message-ID chohle has captured on outbound so we can
  // match without hitting the DB per message.
  const projectByMsgId = new Map<string, number>()
  const outboundRows = db
    .prepare(
      `SELECT project_id, message_id FROM project_emails WHERE direction = 'outbound' AND message_id IS NOT NULL`
    )
    .all() as Array<{ project_id: number; message_id: string }>
  for (const r of outboundRows) projectByMsgId.set(r.message_id, r.project_id)

  const existingInbound = new Set<string>(
    (
      db
        .prepare(
          `SELECT message_id FROM project_emails WHERE direction = 'inbound' AND message_id IS NOT NULL`
        )
        .all() as Array<{ message_id: string }>
    ).map((r) => r.message_id)
  )

  const insert = db.prepare(
    `INSERT INTO project_emails (project_id, direction, from_address, to_address,
                                 subject, body_html, body_text, sent_at, message_id)
     VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, ?)`
  )

  let scanned = 0
  let inserted = 0
  let duplicates = 0

  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX', { readonly: true })
    try {
      // SEARCH SINCE returns sequence numbers; { uid: true } makes them UIDs
      // so the subsequent fetch is stable across new arrivals mid sync.
      const uids = await client.search({ since }, { uid: true })
      // Cap at 200 to keep runs bounded, same as the other drivers.
      // Guard `fetch` against the empty set: imapflow throws on an empty
      // messageset (issue #209), and skipping the loop still falls
      // through to the last_sync_at UPDATE so a quiet inbox doesn't keep
      // re-searching the same lookback window forever.
      const limited = (uids ?? []).slice(-200)
      if (limited.length > 0)
        for await (const msg of client.fetch(
          limited,
          { source: true, internalDate: true },
          { uid: true }
        ) as AsyncIterable<FetchMessageObject>) {
          scanned += 1
          if (!msg.source) continue
          const parsed = await simpleParser(msg.source)
          const incomingId = parsed.messageId ? stripAngles(parsed.messageId) : null
          if (incomingId && existingInbound.has(incomingId)) {
            duplicates += 1
            continue
          }

          const anchors = Array.from(
            new Set(
              [
                ...(parsed.inReplyTo ? [parsed.inReplyTo] : []).flatMap(
                  (s) => s.match(/<[^>]+>/g) ?? [s]
                ),
                ...asArray(parsed.references).flatMap((s) => s.match(/<[^>]+>/g) ?? [s])
              ]
                .map(stripAngles)
                .filter(Boolean)
            )
          )

          let projectId: number | undefined
          for (const a of anchors) {
            const match = projectByMsgId.get(a)
            if (match !== undefined) {
              projectId = match
              break
            }
          }
          if (!projectId) continue

          const html = typeof parsed.html === 'string' ? parsed.html : ''
          const text = parsed.text ?? ''
          const from = parsed.from?.text ?? null
          const to = Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text).join(', ')
            : (parsed.to?.text ?? null)
          const subject = parsed.subject ?? ''
          const dateMs = (parsed.date ?? msg.internalDate ?? new Date()).valueOf()
          const sentAt = new Date(dateMs).toISOString().replace('T', ' ').slice(0, 19)

          insert.run(projectId, from, to, subject, html, text, sentAt, incomingId)
          inserted += 1
          if (incomingId) existingInbound.add(incomingId)
        }
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      /* ignore */
    }
  }

  db.prepare(`UPDATE mailboxes SET last_sync_at = ?, last_error = NULL WHERE id = ?`).run(
    new Date().toISOString(),
    mailbox.id
  )

  return { scanned, inserted, duplicates }
}

export function listImapMailboxes(db: Database): ImapSyncMailbox[] {
  return db
    .prepare(
      `SELECT id, provider, email_address, imap_host, imap_port, imap_user,
            imap_password_enc, last_sync_at
     FROM mailboxes WHERE provider = 'imap'`
    )
    .all() as ImapSyncMailbox[]
}
