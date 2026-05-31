// Verifies the Gmail sync driver against fixture Gmail API responses.
// No network calls; $fetch is stubbed per-test and dispatches by URL
// since Gmail's list and get endpoints have very different shapes.
// Uses an in-memory SQLite database so the full migration set runs in
// isolation.

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../server/utils/secrets'
import { runMigrations } from '../server/utils/migrate'
import { syncGmailMailbox } from '../server/utils/gmailSync'

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare(
    `INSERT INTO customers (type, name, country, language, payment_term_days)
     VALUES ('company', 'ACME AG', 'CH', 'de', 30)`
  ).run()
  const customerId = Number(
    (db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  db.prepare(
    `INSERT INTO projects (name, customer_id, direction, stage)
     VALUES ('Marketing site', ?, 'sales', 'proposal')`
  ).run(customerId)
  const projectId = Number(
    (db.prepare('SELECT id FROM projects ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  db.prepare(
    `INSERT INTO project_emails (project_id, direction, from_address, to_address,
                                  subject, body_html, body_text, message_id)
     VALUES (?, 'outbound', 'us@batze.ch', 'thomas@acme.ch', 'Proposal',
             '<p>Hi Thomas</p>', 'Hi Thomas', 'original-1@batze.ch')`
  ).run(projectId)

  return { db, projectId }
}

function makeMailbox(db: Database.Database, opts: { tokenExpiresAt?: string } = {}) {
  const exp = opts.tokenExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
  db.prepare(
    `INSERT INTO mailboxes (provider, label, email_address, access_token_enc,
                             refresh_token_enc, token_expires_at,
                             provider_client_id, provider_client_secret_enc)
     VALUES ('gmail', 'Test', 'us@batze.ch', ?, ?, ?, ?, ?)`
  ).run(
    encryptSecret('fake-access-token'),
    encryptSecret('fake-refresh-token'),
    exp,
    '123456789012-abc.apps.googleusercontent.com',
    encryptSecret('fake-client-secret')
  )
  return db
    .prepare(
      `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
            token_expires_at, provider_client_id, provider_client_secret_enc, last_sync_at
     FROM mailboxes ORDER BY id DESC LIMIT 1`
    )
    .get() as Parameters<typeof syncGmailMailbox>[1]
}

interface GmailMessageStub {
  id: string
  internalDate?: string
  headers?: Array<{ name: string; value: string }>
  htmlBody?: string
  textBody?: string
}

// Stubs $fetch to act like Gmail's API: list calls return ids + optional
// nextPageToken, per-message gets return a fixture with payload.
// Pass `tokenResponse` to also handle the OAuth refresh endpoint.
function stubGmail(opts: {
  listPages?: Array<{ ids: string[]; nextPageToken?: string }>
  messages?: Record<string, GmailMessageStub>
  tokenResponse?: { access_token: string; refresh_token?: string; expires_in: number }
}) {
  const listPages = opts.listPages ?? []
  const messages = opts.messages ?? {}
  let listIdx = 0
  const calls: string[] = []
  const fetch = vi.fn(async (url: string) => {
    calls.push(url)
    if (url.includes('oauth2.googleapis.com/token')) {
      if (!opts.tokenResponse)
        throw new Error('stubGmail: token call but no tokenResponse provided')
      return opts.tokenResponse
    }
    if (url.includes('/messages/')) {
      const id = url.split('/messages/')[1]!.split('?')[0]!
      const m = messages[id]
      if (!m) throw new Error(`stubGmail: get ${id} but no fixture provided`)
      const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
      const parts = []
      if (m.htmlBody !== undefined)
        parts.push({ mimeType: 'text/html', body: { data: b64(m.htmlBody) } })
      if (m.textBody !== undefined)
        parts.push({ mimeType: 'text/plain', body: { data: b64(m.textBody) } })
      return {
        id: m.id,
        internalDate: m.internalDate ?? String(Date.now()),
        payload: { headers: m.headers ?? [], parts }
      }
    }
    if (url.includes('/messages')) {
      const page = listPages[listIdx]
      if (!page)
        throw new Error(
          `stubGmail: list page ${listIdx + 1} requested but only ${listPages.length} provided`
        )
      listIdx += 1
      return {
        messages: page.ids.map((id) => ({ id, threadId: id })),
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {})
      }
    }
    throw new Error(`stubGmail: unexpected url ${url}`)
  })
  vi.stubGlobal('$fetch', fetch)
  return { fetch, calls }
}

const matchingReply: GmailMessageStub = {
  id: 'gmsg1',
  internalDate: String(Date.parse('2026-05-31T10:00:00Z')),
  headers: [
    { name: 'Message-Id', value: '<reply-1@gmail.com>' },
    { name: 'In-Reply-To', value: '<original-1@batze.ch>' },
    { name: 'References', value: '<original-1@batze.ch>' },
    { name: 'Subject', value: 'Re: Proposal' },
    { name: 'From', value: 'Thomas <thomas@acme.ch>' },
    { name: 'To', value: 'us@batze.ch' }
  ],
  htmlBody: '<p>Sounds great</p>',
  textBody: 'Sounds great'
}

describe('syncGmailMailbox', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('inserts an inbound row when In-Reply-To matches a captured outbound message_id', async () => {
    const { db, projectId } = makeDb()
    const mailbox = makeMailbox(db)
    stubGmail({
      listPages: [{ ids: ['gmsg1'] }],
      messages: { gmsg1: matchingReply }
    })

    const result = await syncGmailMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
    expect(result.duplicates).toBe(0)

    const inbound = db
      .prepare(`SELECT * FROM project_emails WHERE direction = 'inbound'`)
      .all() as Array<{
      project_id: number
      subject: string
      message_id: string
      from_address: string
      body_html: string
    }>
    expect(inbound).toHaveLength(1)
    expect(inbound[0]!.project_id).toBe(projectId)
    expect(inbound[0]!.subject).toBe('Re: Proposal')
    expect(inbound[0]!.message_id).toBe('reply-1@gmail.com')
    expect(inbound[0]!.from_address).toBe('Thomas <thomas@acme.ch>')
    expect(inbound[0]!.body_html).toBe('<p>Sounds great</p>')
  })

  it('ignores messages whose anchors do not match any captured outbound id', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGmail({
      listPages: [{ ids: ['unrelated'] }],
      messages: {
        unrelated: {
          id: 'unrelated',
          headers: [
            { name: 'Message-Id', value: '<random@spam.com>' },
            { name: 'Subject', value: 'Buy more synergy' }
          ],
          textBody: 'Limited time offer'
        }
      }
    })

    const result = await syncGmailMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(0)
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`)
          .get() as { n: number }
      ).n
    ).toBe(0)
  })

  it('does not insert the same message twice (dedup via Message-Id)', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGmail({
      listPages: [{ ids: ['gmsg1'] }],
      messages: { gmsg1: matchingReply }
    })
    await syncGmailMailbox(db, mailbox)

    stubGmail({
      listPages: [{ ids: ['gmsg1'] }],
      messages: { gmsg1: matchingReply }
    })
    const reload = db
      .prepare(
        `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
              token_expires_at, provider_client_id, provider_client_secret_enc, last_sync_at
       FROM mailboxes WHERE id = ?`
      )
      .get(mailbox.id) as typeof mailbox

    const result = await syncGmailMailbox(db, reload)
    expect(result.inserted).toBe(0)
    expect(result.duplicates).toBe(1)
    expect(
      (
        db
          .prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`)
          .get() as { n: number }
      ).n
    ).toBe(1)
  })

  it('parses multiple anchors from a space-separated References header', async () => {
    const { db, projectId } = makeDb()
    db.prepare(
      `INSERT INTO project_emails (project_id, direction, message_id, subject, body_html, body_text)
       VALUES (?, 'outbound', 'original-2@batze.ch', 'Follow up', '', '')`
    ).run(projectId)
    const mailbox = makeMailbox(db)
    stubGmail({
      listPages: [{ ids: ['gmsg2'] }],
      messages: {
        gmsg2: {
          id: 'gmsg2',
          headers: [
            { name: 'Message-Id', value: '<reply-2@gmail.com>' },
            { name: 'References', value: '<some-other@x.com> <original-2@batze.ch>' },
            { name: 'Subject', value: 'Re: Follow up' },
            { name: 'From', value: 'thomas@acme.ch' }
          ],
          textBody: 'ok'
        }
      }
    })

    const result = await syncGmailMailbox(db, mailbox)
    expect(result.inserted).toBe(1)
  })

  it('refreshes an expired access token before fetching', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db, { tokenExpiresAt: new Date(Date.now() - 60_000).toISOString() })

    const { calls } = stubGmail({
      listPages: [{ ids: [] }],
      tokenResponse: {
        access_token: 'fresh-access',
        refresh_token: 'fresh-refresh',
        expires_in: 3600
      }
    })

    await syncGmailMailbox(db, mailbox)
    expect(calls[0]).toContain('oauth2.googleapis.com/token')
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('paginates nextPageToken across multiple list pages', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGmail({
      listPages: [{ ids: [], nextPageToken: 'tok1' }, { ids: ['gmsg1'] }],
      messages: { gmsg1: matchingReply }
    })
    const result = await syncGmailMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
  })
})
