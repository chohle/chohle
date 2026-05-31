// Helpers shared by the mailbox API endpoints and the upcoming sync
// worker. Anything that touches encrypted columns goes through here so
// the secrets never leak into responses by accident.

import { encryptSecret } from './secrets'

export type Provider = 'outlook' | 'gmail' | 'imap'

// Shape returned by every per-provider sync driver. Hoisted here so
// outlook/gmail/imapSync.ts can import a single canonical interface
// instead of redeclaring it three times (which made Nuxt auto-import
// flag "Duplicated imports SyncResult" on boot).
export interface SyncResult {
  scanned: number
  inserted: number
  duplicates: number
}

export interface MailboxRow {
  id: number
  provider: Provider
  label: string
  email_address: string | null
  token_expires_at: string | null
  last_sync_at: string | null
  last_error: string | null
  created_at: string
}

// What we ever return to the client. Token columns and IMAP password
// stay server-side.
export interface MailboxResponse extends MailboxRow {
  provider_label: string
}

const PROVIDER_LABELS: Record<Provider, string> = {
  outlook: 'Microsoft 365 / Outlook',
  gmail: 'Google / Gmail',
  imap: 'IMAP'
}

export function toMailboxResponse(row: MailboxRow): MailboxResponse {
  return { ...row, provider_label: PROVIDER_LABELS[row.provider] }
}

export interface InsertOutlookMailboxInput {
  label: string
  emailAddress: string | null
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  clientId: string
  tenantId: string
}

// Wraps the encrypt + INSERT for the Outlook connect flow. Tokens are
// AES-256-GCM encrypted at rest; only `mailbox.id` is returned.
export function insertOutlookMailbox(
  db: import('better-sqlite3').Database,
  input: InsertOutlookMailboxInput
): number {
  const expiresAt = new Date(Date.now() + Math.max(0, input.expiresInSeconds) * 1000).toISOString()
  const info = db
    .prepare(
      `INSERT INTO mailboxes (provider, label, email_address, access_token_enc,
                             refresh_token_enc, token_expires_at,
                             provider_client_id, provider_tenant_id)
     VALUES ('outlook', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.label.trim() || 'Outlook',
      input.emailAddress,
      encryptSecret(input.accessToken),
      encryptSecret(input.refreshToken),
      expiresAt,
      input.clientId,
      input.tenantId
    )
  return Number(info.lastInsertRowid)
}

export interface InsertGmailMailboxInput {
  label: string
  emailAddress: string | null
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  clientId: string
  clientSecret: string
}

// Same idea as insertOutlookMailbox but for Gmail. Google's Web OAuth
// client requires a client_secret on the token exchange even with PKCE,
// so we encrypt and store it alongside the tokens for the refresh flow.
export function insertGmailMailbox(
  db: import('better-sqlite3').Database,
  input: InsertGmailMailboxInput
): number {
  const expiresAt = new Date(Date.now() + Math.max(0, input.expiresInSeconds) * 1000).toISOString()
  const info = db
    .prepare(
      `INSERT INTO mailboxes (provider, label, email_address, access_token_enc,
                             refresh_token_enc, token_expires_at,
                             provider_client_id, provider_client_secret_enc)
     VALUES ('gmail', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.label.trim() || 'Gmail',
      input.emailAddress,
      encryptSecret(input.accessToken),
      encryptSecret(input.refreshToken),
      expiresAt,
      input.clientId,
      encryptSecret(input.clientSecret)
    )
  return Number(info.lastInsertRowid)
}

export interface InsertImapMailboxInput {
  label: string
  emailAddress: string | null
  host: string
  port: number
  user: string
  password: string
}

// IMAP has no OAuth; the user supplies host/port/user/password directly.
// We encrypt the password at rest (AES-256-GCM) like the OAuth tokens.
// The connect endpoint must have already verified the credentials by
// logging in once before calling this.
export function insertImapMailbox(
  db: import('better-sqlite3').Database,
  input: InsertImapMailboxInput
): number {
  const info = db
    .prepare(
      `INSERT INTO mailboxes (provider, label, email_address,
                             imap_host, imap_port, imap_user, imap_password_enc)
     VALUES ('imap', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.label.trim() || input.emailAddress || input.user,
      input.emailAddress,
      input.host.trim(),
      input.port,
      input.user.trim(),
      encryptSecret(input.password)
    )
  return Number(info.lastInsertRowid)
}
