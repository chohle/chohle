// Outlook (Microsoft Graph) sync driver.
//
// The sync worker calls `syncOutlookMailbox` per connected outlook
// mailbox on a schedule (and the manual "Sync now" endpoint calls it
// directly). It refreshes the access token if needed, pulls inbox
// messages since the last sync, and inserts the ones whose
// In-Reply-To / References headers match a Message-ID chohle previously
// captured on outbound. No whole-inbox import; only replies to mail we
// actually sent.

import type { Database } from 'better-sqlite3'
import { decryptSecret, encryptSecret } from './secrets'
import type { SyncResult } from './mailbox'
import { loadHandledInboundIds, triageInbound } from './triage'

// Server side mailbox row. Includes the encrypted token columns and the
// OAuth app credentials needed to refresh the access token; distinct on
// purpose from the safe `MailboxRow` in server/utils/mailbox.ts which is
// shaped for API responses and never carries secret columns.
interface OutlookSyncMailbox {
  id: number
  provider: 'outlook' | 'gmail' | 'imap'
  email_address: string | null
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
  provider_client_id: string | null
  provider_tenant_id: string | null
  last_sync_at: string | null
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

interface GraphMessage {
  id: string
  internetMessageId?: string | null
  subject?: string | null
  bodyPreview?: string | null
  body?: { contentType?: 'html' | 'text'; content?: string } | null
  from?: { emailAddress?: { address?: string; name?: string } } | null
  toRecipients?: Array<{ emailAddress?: { address?: string } }> | null
  receivedDateTime?: string
  internetMessageHeaders?: Array<{ name: string; value: string }> | null
}

interface GraphListResponse {
  value: GraphMessage[]
  '@odata.nextLink'?: string
}

// Outbound Message-IDs are stored with the angle brackets stripped.
// Inbound headers usually wrap each id in <>. Normalise so comparisons
// work either way.
function stripAngles(id: string): string {
  return id.replace(/^<|>$/g, '').trim()
}

function headerValue(msg: GraphMessage, name: string): string | null {
  const lower = name.toLowerCase()
  for (const h of msg.internetMessageHeaders ?? []) {
    if (h.name?.toLowerCase() === lower) return h.value
  }
  return null
}

// In-Reply-To is usually one id; References can be space-separated.
// Returns the unique set of normalised ids referenced by this message.
function extractAnchors(msg: GraphMessage): string[] {
  const ids: string[] = []
  const inReply = headerValue(msg, 'In-Reply-To')
  const refs = headerValue(msg, 'References')
  if (inReply) ids.push(...(inReply.match(/<[^>]+>/g) ?? [inReply]))
  if (refs) ids.push(...(refs.match(/<[^>]+>/g) ?? refs.split(/\s+/)))
  return Array.from(new Set(ids.map(stripAngles).filter(Boolean)))
}

async function refreshAccessToken(db: Database, mailbox: OutlookSyncMailbox): Promise<string> {
  if (!mailbox.refresh_token_enc || !mailbox.provider_client_id || !mailbox.provider_tenant_id) {
    throw new Error('mailbox missing refresh token or app credentials; reconnect required')
  }
  const refresh = decryptSecret(mailbox.refresh_token_enc)
  const url = `https://login.microsoftonline.com/${mailbox.provider_tenant_id}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: mailbox.provider_client_id,
    grant_type: 'refresh_token',
    refresh_token: refresh,
    scope: 'offline_access User.Read Mail.Read'
  })
  const res = await $fetch<TokenResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const expiresAt = new Date(Date.now() + res.expires_in * 1000).toISOString()
  db.prepare(
    `UPDATE mailboxes SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?
     WHERE id = ?`
  ).run(
    encryptSecret(res.access_token),
    encryptSecret(res.refresh_token ?? refresh),
    expiresAt,
    mailbox.id
  )
  return res.access_token
}

async function ensureFreshToken(db: Database, mailbox: OutlookSyncMailbox): Promise<string> {
  if (!mailbox.access_token_enc) throw new Error('mailbox has no access token; reconnect required')
  const expiresAt = mailbox.token_expires_at ? new Date(mailbox.token_expires_at).getTime() : 0
  // Refresh 60s before expiry so a long sync run doesn't time out mid-way.
  if (expiresAt - 60_000 > Date.now()) return decryptSecret(mailbox.access_token_enc)
  return refreshAccessToken(db, mailbox)
}

async function fetchInboxSince(token: string, sinceIso: string): Promise<GraphMessage[]> {
  // /me/mailFolders/Inbox/messages limits to received mail. Select only
  // what we need + internetMessageHeaders for threading. Graph caps each
  // page at 50 by default; follow @odata.nextLink to paginate but cap at
  // 200 messages per sync run to keep things bounded.
  const select = [
    'id',
    'internetMessageId',
    'subject',
    'bodyPreview',
    'body',
    'from',
    'toRecipients',
    'receivedDateTime',
    'internetMessageHeaders'
  ].join(',')
  const filter = `receivedDateTime gt ${sinceIso}`
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime asc`

  const out: GraphMessage[] = []
  while (url && out.length < 200) {
    const res: GraphListResponse = await $fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' }
    })
    out.push(...res.value)
    url = res['@odata.nextLink']
  }
  return out
}

export async function syncOutlookMailbox(
  db: Database,
  mailbox: OutlookSyncMailbox
): Promise<SyncResult> {
  const token = await ensureFreshToken(db, mailbox)
  // On first sync, look back 7 days. Subsequent syncs resume from
  // last_sync_at minus a small overlap so a slow-clock reply doesn't slip
  // through the window. Dedup catches the overlap.
  const lookback = mailbox.last_sync_at
    ? new Date(new Date(mailbox.last_sync_at).getTime() - 5 * 60_000).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const messages = await fetchInboxSince(token, lookback)

  // Pre-load every Message-ID chohle has on file — outbound AND already-matched
  // inbound — so a reply can thread off any earlier message in the chain, not
  // only the one we originally sent. Long threads sometimes reference just a
  // prior inbound message in In-Reply-To with a truncated References header.
  // The map fits in memory for any realistic chohle install.
  const projectByMsgId = new Map<string, number>()
  const anchorRows = db
    .prepare(`SELECT project_id, message_id FROM project_emails WHERE message_id IS NOT NULL`)
    .all() as Array<{ project_id: number; message_id: string }>
  for (const r of anchorRows) projectByMsgId.set(r.message_id, r.project_id)

  // Already-handled inbound ids: attached to a project OR sitting in triage
  // (by Graph internetMessageId).
  const existingInbound = loadHandledInboundIds(db)

  // OR IGNORE: a DB-level backstop on the unique message_id index in case two
  // runs overlap and both clear the in-memory dedup check.
  const insert = db.prepare(
    `INSERT OR IGNORE INTO project_emails (project_id, direction, from_address, to_address,
                                 subject, body_html, body_text, sent_at, message_id)
     VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, ?)`
  )

  let inserted = 0
  let duplicates = 0
  let triaged = 0
  for (const msg of messages) {
    const incomingId = msg.internetMessageId ? stripAngles(msg.internetMessageId) : null
    if (incomingId && existingInbound.has(incomingId)) {
      duplicates += 1
      continue
    }

    const anchors = extractAnchors(msg)
    let projectId: number | undefined
    for (const a of anchors) {
      const match = projectByMsgId.get(a)
      if (match !== undefined) {
        projectId = match
        break
      }
    }

    const html = msg.body?.contentType === 'html' ? (msg.body.content ?? '') : ''
    const text =
      msg.body?.contentType === 'text' ? (msg.body.content ?? '') : (msg.bodyPreview ?? '')
    const from = msg.from?.emailAddress?.address ?? null
    const to =
      (msg.toRecipients ?? [])
        .map((r) => r.emailAddress?.address)
        .filter(Boolean)
        .join(', ') || null
    const sentAt = (msg.receivedDateTime ?? new Date().toISOString()).replace('T', ' ').slice(0, 19)

    // No header thread match → park it in triage with a suggestion instead of
    // dropping it. Never auto-attached to a project.
    if (!projectId) {
      if (
        triageInbound(db, {
          mailboxId: mailbox.id,
          messageId: incomingId,
          inReplyTo: anchors[0] ?? null,
          referencesIds: anchors.length ? anchors.join(' ') : null,
          fromAddress: from,
          toAddress: to,
          subject: msg.subject ?? '',
          bodyHtml: html,
          bodyText: text,
          sentAt
        }) === 'triaged'
      ) {
        triaged += 1
        if (incomingId) existingInbound.add(incomingId)
      }
      continue
    }

    const info = insert.run(projectId, from, to, msg.subject ?? '', html, text, sentAt, incomingId)
    if (info.changes > 0) {
      inserted += 1
      if (incomingId) {
        existingInbound.add(incomingId)
        // Register as an anchor so a later message in this same batch can
        // thread off it.
        projectByMsgId.set(incomingId, projectId)
      }
    } else {
      duplicates += 1
    }
  }

  db.prepare(`UPDATE mailboxes SET last_sync_at = ?, last_error = NULL WHERE id = ?`).run(
    new Date().toISOString(),
    mailbox.id
  )

  return { scanned: messages.length, inserted, duplicates, triaged }
}

export function listOutlookMailboxes(db: Database): OutlookSyncMailbox[] {
  return db
    .prepare(
      `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
            token_expires_at, provider_client_id, provider_tenant_id, last_sync_at
     FROM mailboxes WHERE provider = 'outlook'`
    )
    .all() as OutlookSyncMailbox[]
}

export function recordSyncError(db: Database, mailboxId: number, message: string) {
  db.prepare(`UPDATE mailboxes SET last_error = ? WHERE id = ?`).run(
    message.slice(0, 500),
    mailboxId
  )
}
