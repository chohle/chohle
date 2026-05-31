// Verifies the sync driver against fixture Microsoft Graph responses.
// No network calls; $fetch is stubbed per-test. Uses an in-memory SQLite
// database so the full migration set runs in isolation.

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../server/utils/secrets'
import { runMigrations } from '../server/utils/migrate'
import { syncOutlookMailbox } from '../server/utils/outlookSync'

type GraphMessage = Record<string, unknown>

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  // Minimal sender + customer + project + outbound email so the sync has
  // something to match anchors against.
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
  // Far future expiry by default so the test doesn't try to refresh.
  const exp = opts.tokenExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
  db.prepare(
    `INSERT INTO mailboxes (provider, label, email_address, access_token_enc,
                             refresh_token_enc, token_expires_at,
                             provider_client_id, provider_tenant_id)
     VALUES ('outlook', 'Test', 'us@batze.ch', ?, ?, ?, ?, ?)`
  ).run(
    encryptSecret('fake-access-token'),
    encryptSecret('fake-refresh-token'),
    exp,
    '00000000-0000-0000-0000-000000000001',
    'common'
  )
  return db.prepare(
    `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
            token_expires_at, provider_client_id, provider_tenant_id, last_sync_at
     FROM mailboxes ORDER BY id DESC LIMIT 1`
  ).get() as Parameters<typeof syncOutlookMailbox>[1]
}

function stubGraphResponses(pages: { value: GraphMessage[]; '@odata.nextLink'?: string }[]) {
  // Returns the pages in order. If the code under test asks for a page
  // beyond what we provided, throw instead of silently returning an
  // empty payload, so over-invocation surfaces as a clear test failure.
  let idx = 0
  const fetch = vi.fn(async () => {
    const page = pages[idx]
    if (!page) {
      throw new Error(`stubGraphResponses: $fetch called ${idx + 1} times but only ${pages.length} page(s) provided`)
    }
    idx += 1
    return page
  })
  vi.stubGlobal('$fetch', fetch)
  return fetch
}

const replyMatching: GraphMessage = {
  id: 'AAMkAGI1',
  internetMessageId: '<reply-1@outlook.com>',
  subject: 'Re: Proposal',
  bodyPreview: 'Sounds great, let\'s do it.',
  body: { contentType: 'html', content: '<p>Sounds great, let&apos;s do it.</p>' },
  from: { emailAddress: { address: 'thomas@acme.ch', name: 'Thomas' } },
  toRecipients: [{ emailAddress: { address: 'us@batze.ch' } }],
  receivedDateTime: '2026-05-31T10:00:00Z',
  internetMessageHeaders: [
    { name: 'In-Reply-To', value: '<original-1@batze.ch>' },
    { name: 'References',  value: '<original-1@batze.ch>' }
  ]
}

const replyUnrelated: GraphMessage = {
  id: 'AAMkAGI2',
  internetMessageId: '<random-marketing@spam.com>',
  subject: 'Buy more synergy',
  body: { contentType: 'text', content: 'Limited time offer' },
  from: { emailAddress: { address: 'spam@spam.com' } },
  toRecipients: [{ emailAddress: { address: 'us@batze.ch' } }],
  receivedDateTime: '2026-05-31T11:00:00Z',
  internetMessageHeaders: []
}

describe('syncOutlookMailbox', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('inserts an inbound row when In-Reply-To matches a captured outbound message_id', async () => {
    const { db, projectId } = makeDb()
    const mailbox = makeMailbox(db)
    stubGraphResponses([{ value: [replyMatching] }])

    const result = await syncOutlookMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
    expect(result.duplicates).toBe(0)

    const inbound = db.prepare(
      `SELECT * FROM project_emails WHERE direction = 'inbound'`
    ).all() as Array<{ project_id: number; subject: string; message_id: string; from_address: string }>
    expect(inbound).toHaveLength(1)
    expect(inbound[0]!.project_id).toBe(projectId)
    expect(inbound[0]!.subject).toBe('Re: Proposal')
    expect(inbound[0]!.message_id).toBe('reply-1@outlook.com')
    expect(inbound[0]!.from_address).toBe('thomas@acme.ch')
  })

  it('ignores messages whose anchors do not match any captured outbound id', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGraphResponses([{ value: [replyUnrelated] }])

    const result = await syncOutlookMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(0)
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`).get() as { n: number }).n
    ).toBe(0)
  })

  it('does not insert the same message twice (dedup via internetMessageId)', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGraphResponses([{ value: [replyMatching] }])
    await syncOutlookMailbox(db, mailbox)

    // Reset stub and feed the same message again on a second run.
    stubGraphResponses([{ value: [replyMatching] }])
    const reload = db.prepare(
      `SELECT id, provider, email_address, access_token_enc, refresh_token_enc,
              token_expires_at, provider_client_id, provider_tenant_id, last_sync_at
       FROM mailboxes WHERE id = ?`
    ).get(mailbox.id) as typeof mailbox

    const result = await syncOutlookMailbox(db, reload)
    expect(result.inserted).toBe(0)
    expect(result.duplicates).toBe(1)
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`).get() as { n: number }).n
    ).toBe(1)
  })

  it('parses multiple anchors from a space-separated References header', async () => {
    const { db, projectId } = makeDb()
    // Add a second outbound so References has more than one matching anchor.
    db.prepare(
      `INSERT INTO project_emails (project_id, direction, message_id, subject, body_html, body_text)
       VALUES (?, 'outbound', 'original-2@batze.ch', 'Follow up', '', '')`
    ).run(projectId)
    const mailbox = makeMailbox(db)
    stubGraphResponses([{
      value: [{
        ...replyMatching,
        internetMessageId: '<reply-2@outlook.com>',
        internetMessageHeaders: [
          { name: 'References', value: '<some-other@x.com> <original-2@batze.ch>' }
        ]
      }]
    }])

    const result = await syncOutlookMailbox(db, mailbox)
    expect(result.inserted).toBe(1)
  })

  it('refreshes an expired access token before fetching', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db, { tokenExpiresAt: new Date(Date.now() - 60_000).toISOString() })

    let fetchCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      fetchCalls += 1
      if (url.includes('login.microsoftonline.com')) {
        return {
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          expires_in: 3600
        }
      }
      return { value: [] }
    })
    vi.stubGlobal('$fetch', fetchMock)

    await syncOutlookMailbox(db, mailbox)
    expect(fetchCalls).toBeGreaterThanOrEqual(2) // token + at least one graph call
    expect(fetchMock.mock.calls[0]![0]).toContain('login.microsoftonline.com')
  })

  it('paginates @odata.nextLink across multiple pages', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubGraphResponses([
      { value: [], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?next' },
      { value: [replyMatching] }
    ])
    const result = await syncOutlookMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
  })
})
