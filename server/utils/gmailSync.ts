// Gmail (Google Gmail API v1) sync driver.
//
// Mirror of outlookSync.ts. The sync worker calls `syncGmailMailbox` per
// connected gmail mailbox on a schedule (and the manual "Sync now"
// endpoint calls it directly). It refreshes the access token if needed,
// lists inbox message IDs since the last sync, fetches each message's
// headers + body, and inserts the ones whose In-Reply-To / References
// match a Message-ID chohle previously captured on outbound. No
// whole-inbox import; only replies to mail we actually sent.

import type { Database } from 'better-sqlite3'
import { decryptSecret, encryptSecret } from './secrets'
import type { SyncResult } from './mailbox'

// Distinct from the safe `MailboxRow` in server/utils/mailbox.ts on
// purpose; this one carries the encrypted token columns + Google client
// app credentials needed for token refresh.
interface GmailSyncMailbox {
  id: number
  provider: 'outlook' | 'gmail' | 'imap'
  email_address: string | null
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expires_at: string | null
  provider_client_id: string | null
  provider_client_secret_enc: string | null
  last_sync_at: string | null
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
}

interface GmailHeader {
  name: string
  value: string
}
interface GmailPart {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
interface GmailMessage {
  id: string
  threadId?: string
  internalDate?: string
  payload?: GmailPart
}

function stripAngles(id: string): string {
  return id.replace(/^<|>$/g, '').trim()
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const lower = name.toLowerCase()
  for (const h of headers ?? []) {
    if (h.name?.toLowerCase() === lower) return h.value
  }
  return null
}

// In-Reply-To is usually one id; References can be space-separated.
function extractAnchors(payload: GmailPart | undefined): string[] {
  const ids: string[] = []
  const inReply = header(payload?.headers, 'In-Reply-To')
  const refs = header(payload?.headers, 'References')
  if (inReply) ids.push(...(inReply.match(/<[^>]+>/g) ?? [inReply]))
  if (refs) ids.push(...(refs.match(/<[^>]+>/g) ?? refs.split(/\s+/)))
  return Array.from(new Set(ids.map(stripAngles).filter(Boolean)))
}

// Gmail's payload is a tree of parts. Walk it depth first and return the
// first part matching the wanted mimeType. base64url decode the body.
function findPart(payload: GmailPart | undefined, wantMime: string): string {
  if (!payload) return ''
  if (payload.mimeType === wantMime && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  }
  for (const child of payload.parts ?? []) {
    const r = findPart(child, wantMime)
    if (r) return r
  }
  return ''
}

async function refreshAccessToken(db: Database, mailbox: GmailSyncMailbox): Promise<string> {
  if (
    !mailbox.refresh_token_enc ||
    !mailbox.provider_client_id ||
    !mailbox.provider_client_secret_enc
  ) {
    throw new Error('mailbox missing refresh token or app credentials; reconnect required')
  }
  const refresh = decryptSecret(mailbox.refresh_token_enc)
  const clientSecret = decryptSecret(mailbox.provider_client_secret_enc)
  const body = new URLSearchParams({
    client_id: mailbox.provider_client_id,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refresh
  })
  const res = await $fetch<TokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  // Google usually does NOT issue a new refresh_token on refresh; keep the old one.
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

async function ensureFreshToken(db: Database, mailbox: GmailSyncMailbox): Promise<string> {
  if (!mailbox.access_token_enc) throw new Error('mailbox has no access token; reconnect required')
  const expiresAt = mailbox.token_expires_at ? new Date(mailbox.token_expires_at).getTime() : 0
  // Refresh 60s before expiry so a long sync run doesn't time out mid-way.
  if (expiresAt - 60_000 > Date.now()) return decryptSecret(mailbox.access_token_enc)
  return refreshAccessToken(db, mailbox)
}

// Gmail's `q` supports `after:<unix-seconds>`. Returns message IDs
// (Gmail's list endpoint doesn't return headers/body, that needs a
// follow-up get per message). Caps at 200 messages per sync run.
async function listInboxIdsSince(token: string, sinceUnix: number): Promise<string[]> {
  const q = encodeURIComponent(`in:inbox after:${sinceUnix}`)
  let url: string | undefined =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`
  const ids: string[] = []
  while (url && ids.length < 200) {
    const res: GmailListResponse = await $fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    for (const m of res.messages ?? []) ids.push(m.id)
    if (!res.nextPageToken) break
    url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50&pageToken=${encodeURIComponent(res.nextPageToken)}`
  }
  return ids
}

async function getMessage(token: string, id: string): Promise<GmailMessage> {
  // format=full gives us headers + body parts in one call.
  return $fetch<GmailMessage>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
}

export async function syncGmailMailbox(
  db: Database,
  mailbox: GmailSyncMailbox
): Promise<SyncResult> {
  const token = await ensureFreshToken(db, mailbox)
  // First sync: look back 7 days. Otherwise resume from last_sync_at
  // minus 5 minutes overlap so a slow-clock reply doesn't slip through.
  const sinceMs = mailbox.last_sync_at
    ? new Date(mailbox.last_sync_at).getTime() - 5 * 60_000
    : Date.now() - 7 * 24 * 60 * 60 * 1000
  const sinceUnix = Math.floor(sinceMs / 1000)

  const ids = await listInboxIdsSince(token, sinceUnix)

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

  let inserted = 0
  let duplicates = 0
  for (const id of ids) {
    const msg = await getMessage(token, id)
    const incomingMsgId =
      header(msg.payload?.headers, 'Message-Id') ?? header(msg.payload?.headers, 'Message-ID')
    const normalisedIncoming = incomingMsgId ? stripAngles(incomingMsgId) : null
    if (normalisedIncoming && existingInbound.has(normalisedIncoming)) {
      duplicates += 1
      continue
    }

    const anchors = extractAnchors(msg.payload)
    let projectId: number | undefined
    for (const a of anchors) {
      const match = projectByMsgId.get(a)
      if (match !== undefined) {
        projectId = match
        break
      }
    }
    if (!projectId) continue

    const html = findPart(msg.payload, 'text/html')
    const text = findPart(msg.payload, 'text/plain')
    const from = header(msg.payload?.headers, 'From')
    const to = header(msg.payload?.headers, 'To')
    const subject = header(msg.payload?.headers, 'Subject') ?? ''
    const dateMs = msg.internalDate ? Number(msg.internalDate) : Date.now()
    const sentAt = new Date(dateMs).toISOString().replace('T', ' ').slice(0, 19)

    insert.run(projectId, from, to, subject, html, text, sentAt, normalisedIncoming)
    inserted += 1
    if (normalisedIncoming) existingInbound.add(normalisedIncoming)
  }

  db.prepare(`UPDATE mailboxes SET last_sync_at = ?, last_error = NULL WHERE id = ?`).run(
    new Date().toISOString(),
    mailbox.id
  )

  return { scanned: ids.length, inserted, duplicates }
}

export function listGmailMailboxes(db: Database): GmailSyncMailbox[] {
  return db
    .prepare(
      `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
            token_expires_at, provider_client_id, provider_client_secret_enc, last_sync_at
     FROM mailboxes WHERE provider = 'gmail'`
    )
    .all() as GmailSyncMailbox[]
}
