// Verifies the IMAP sync driver against fixture RFC 5322 messages.
// imapflow is mocked at the module level so no real network sockets
// open; mailparser is left real because we want it to actually parse
// the fixture bytes (that parsing is the part most likely to break
// if the headers we write here drift from RFC reality).

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '../server/utils/secrets'
import { runMigrations } from '../server/utils/migrate'

// Module-level mock so the driver imports the fake ImapFlow.
const fakeClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  search: vi.fn().mockResolvedValue([] as number[]),
  fetch: vi.fn()
}
vi.mock('imapflow', () => ({
  // Must be a real `function` (not an arrow) so `new ImapFlow(...)` works.
  // Returning an object from a constructor function makes JS use that as
  // the instance, so every `new` lands on the same fakeClient singleton.
  ImapFlow: function ImapFlow() { return fakeClient }
}))

// Imported AFTER the mock is registered so the driver gets the fake.
const { syncImapMailbox } = await import('../server/utils/imapSync')

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

function makeMailbox(db: Database.Database) {
  db.prepare(
    `INSERT INTO mailboxes (provider, label, email_address,
                             imap_host, imap_port, imap_user, imap_password_enc)
     VALUES ('imap', 'Test', 'us@batze.ch', 'imap.example.com', 993,
             'us@batze.ch', ?)`
  ).run(encryptSecret('imap-password'))
  return db.prepare(
    `SELECT id, provider, email_address, imap_host, imap_port, imap_user,
            imap_password_enc, last_sync_at
     FROM mailboxes ORDER BY id DESC LIMIT 1`
  ).get() as Parameters<typeof syncImapMailbox>[1]
}

interface MessageFixture {
  uid: number
  messageId: string
  inReplyTo?: string
  references?: string
  subject?: string
  from?: string
  to?: string
  body?: string
  date?: string
}

function buildRfc5322(m: MessageFixture): string {
  const headers = [
    `Message-Id: <${m.messageId}>`,
    m.inReplyTo ? `In-Reply-To: <${m.inReplyTo}>` : null,
    m.references ? `References: ${m.references}` : null,
    `From: ${m.from ?? 'someone@example.com'}`,
    `To: ${m.to ?? 'us@batze.ch'}`,
    `Subject: ${m.subject ?? '(no subject)'}`,
    `Date: ${m.date ?? new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    ''
  ].filter(Boolean).join('\r\n')
  return `${headers}\r\n${m.body ?? 'body'}\r\n`
}

function stubFetch(messages: MessageFixture[]) {
  fakeClient.search.mockResolvedValueOnce(messages.map(m => m.uid))
  fakeClient.fetch.mockImplementationOnce(() => {
    return (async function* () {
      for (const m of messages) {
        yield { uid: m.uid, source: Buffer.from(buildRfc5322(m), 'utf8'), internalDate: new Date() }
      }
    })()
  })
}

describe('syncImapMailbox', () => {
  beforeEach(() => {
    fakeClient.connect.mockClear()
    fakeClient.logout.mockClear()
    fakeClient.getMailboxLock.mockClear()
    fakeClient.search.mockReset().mockResolvedValue([])
    fakeClient.fetch.mockReset()
  })

  it('inserts an inbound row when In-Reply-To matches a captured outbound message_id', async () => {
    const { db, projectId } = makeDb()
    const mailbox = makeMailbox(db)
    stubFetch([{
      uid: 1,
      messageId: 'reply-1@acme.ch',
      inReplyTo: 'original-1@batze.ch',
      references: '<original-1@batze.ch>',
      subject: 'Re: Proposal',
      from: 'Thomas <thomas@acme.ch>',
      body: 'Sounds great'
    }])

    const result = await syncImapMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
    expect(result.duplicates).toBe(0)

    const inbound = db.prepare(
      `SELECT * FROM project_emails WHERE direction = 'inbound'`
    ).all() as Array<{ project_id: number; subject: string; message_id: string }>
    expect(inbound).toHaveLength(1)
    expect(inbound[0]!.project_id).toBe(projectId)
    expect(inbound[0]!.subject).toBe('Re: Proposal')
    expect(inbound[0]!.message_id).toBe('reply-1@acme.ch')
  })

  it('ignores messages whose anchors do not match any captured outbound id', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    stubFetch([{
      uid: 1,
      messageId: 'random@spam.com',
      subject: 'Buy more synergy',
      body: 'Limited time offer'
    }])

    const result = await syncImapMailbox(db, mailbox)
    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(0)
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`).get() as { n: number }).n
    ).toBe(0)
  })

  it('does not insert the same message twice (dedup via Message-Id)', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    const fixture = {
      uid: 1,
      messageId: 'reply-1@acme.ch',
      inReplyTo: 'original-1@batze.ch',
      subject: 'Re: Proposal'
    }
    stubFetch([fixture])
    await syncImapMailbox(db, mailbox)

    stubFetch([fixture])
    const reload = db.prepare(
      `SELECT id, provider, email_address, imap_host, imap_port, imap_user,
              imap_password_enc, last_sync_at
       FROM mailboxes WHERE id = ?`
    ).get(mailbox.id) as typeof mailbox
    const result = await syncImapMailbox(db, reload)
    expect(result.inserted).toBe(0)
    expect(result.duplicates).toBe(1)
    expect(
      (db.prepare(`SELECT COUNT(*) AS n FROM project_emails WHERE direction = 'inbound'`).get() as { n: number }).n
    ).toBe(1)
  })

  it('parses multiple anchors from a space-separated References header', async () => {
    const { db, projectId } = makeDb()
    db.prepare(
      `INSERT INTO project_emails (project_id, direction, message_id, subject, body_html, body_text)
       VALUES (?, 'outbound', 'original-2@batze.ch', 'Follow up', '', '')`
    ).run(projectId)
    const mailbox = makeMailbox(db)
    stubFetch([{
      uid: 1,
      messageId: 'reply-2@acme.ch',
      references: '<some-other@x.com> <original-2@batze.ch>',
      subject: 'Re: Follow up'
    }])

    const result = await syncImapMailbox(db, mailbox)
    expect(result.inserted).toBe(1)
  })

  it('throws a clear error when the mailbox row is missing credentials', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    await expect(syncImapMailbox(db, { ...mailbox, imap_password_enc: null }))
      .rejects.toThrow(/missing IMAP credentials/)
  })

  it('returns early when SEARCH SINCE finds no messages', async () => {
    const { db } = makeDb()
    const mailbox = makeMailbox(db)
    // Default mock: search returns []
    const result = await syncImapMailbox(db, mailbox)
    expect(result).toEqual({ scanned: 0, inserted: 0, duplicates: 0 })
  })
})
