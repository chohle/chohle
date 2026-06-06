// Automatic-ingest pipeline. syncConnection reuses parseCamt053 +
// reconcileStatement (covered by their own suites), so here we assert the
// orchestration: aggregation, dedupe across runs, error recording, ack on
// success, the folder provider, and that runBankSync only touches active
// connections.

process.env.CHOHLE_SECRET = 'test-secret-key-0123456789'

import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../server/utils/migrate'
import { encryptSecret } from '../server/utils/secrets'
import { buildReference } from '../server/utils/qrReference'
import {
  type BankConnectionRow,
  type BankProvider,
  type FetchedStatement,
  folderProvider,
  runBankSync,
  sanitizeConfig,
  syncConnection
} from '../server/utils/bankSync'

const IBAN = 'CH4431999123000889012'

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  db.prepare('INSERT OR IGNORE INTO sender (id, iban, vat_registered) VALUES (1, ?, 0)').run(IBAN)
  db.prepare(
    `INSERT INTO customers (type, name, country, language) VALUES ('company', 'ACME AG', 'CH', 'de')`
  ).run()
  const customerId = Number(
    (db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  db.prepare(
    `INSERT INTO projects (name, customer_id, direction, stage) VALUES ('P', ?, 'sales', 'proposal')`
  ).run(customerId)
  const projectId = Number(
    (db.prepare('SELECT id FROM projects ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  return { db, customerId, projectId }
}

function makeInvoice(
  db: Database.Database,
  customerId: number,
  projectId: number,
  amountRappen: number
): number {
  const r = db
    .prepare(
      `INSERT INTO invoices (customer_id, project_id, number, title, status, issue_date, due_date)
       VALUES (?, ?, '', '', 'sent', '2026-01-01', '2026-02-01')`
    )
    .run(customerId, projectId)
  const id = Number(r.lastInsertRowid)
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
     VALUES (?, '', 1, '', ?, 0, 0, 0)`
  ).run(id, amountRappen)
  return id
}

function insertConn(
  db: Database.Database,
  opts: { provider?: string; status?: string; config?: Record<string, unknown> } = {}
): BankConnectionRow {
  const enc = encryptSecret(JSON.stringify(opts.config ?? {}))
  db.prepare(
    'INSERT INTO bank_connections (iban, provider, status, config) VALUES (?, ?, ?, ?)'
  ).run(IBAN, opts.provider ?? 'folder', opts.status ?? 'active', enc)
  return db
    .prepare('SELECT * FROM bank_connections ORDER BY id DESC LIMIT 1')
    .get() as BankConnectionRow
}

function camtXml(credits: Array<{ amount: string; ref?: string; acctSvcrRef: string }>): string {
  const entries = credits
    .map(
      (c) => `
      <Ntry>
        <Amt Ccy="CHF">${c.amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-01-15</Dt></BookgDt>
        <AcctSvcrRef>${c.acctSvcrRef}</AcctSvcrRef>
        <NtryDtls><TxDtls>
          ${c.ref ? `<RmtInf><Strd><CdtrRefInf><Ref>${c.ref}</Ref></CdtrRefInf></Strd></RmtInf>` : ''}
          <RltdPties><Dbtr><Pty><Nm>ACME AG</Nm></Pty></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>`
    )
    .join('')
  return `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Id>S1</Id>
    <Acct><Id><IBAN>${IBAN}</IBAN></Id></Acct>
    ${entries}
  </Stmt></BkToCstmrStmt>
</Document>`
}

function fakeProvider(statements: FetchedStatement[], opts: { throwMsg?: string } = {}) {
  const acked: string[] = []
  const provider: BankProvider = {
    async fetchStatements() {
      if (opts.throwMsg) throw new Error(opts.throwMsg)
      return statements
    },
    async ack(_config, ref) {
      acked.push(ref)
    }
  }
  return { provider, acked }
}

describe('syncConnection', () => {
  it('imports, auto-matches, aggregates and stamps the connection row', async () => {
    const { db, customerId, projectId } = makeDb()
    const id = makeInvoice(db, customerId, projectId, 50000)
    const conn = insertConn(db)
    const xml = camtXml([{ amount: '500.00', ref: buildReference(id, IBAN), acctSvcrRef: 'B1' }])
    const { provider, acked } = fakeProvider([{ ref: 'r1', filename: 'jan.xml', xml }])

    const result = await syncConnection(db, conn, provider)

    expect(result).toMatchObject({ fetched: 1, imported: 1, autoMatched: 1, errors: [] })
    expect(acked).toEqual(['r1']) // acked on success
    expect(
      (db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as { status: string }).status
    ).toBe('paid')

    const row = db
      .prepare('SELECT last_status, last_error, last_summary FROM bank_connections WHERE id = ?')
      .get(conn.id) as {
      last_status: string
      last_error: string | null
      last_summary: string
    }
    expect(row.last_status).toBe('ok')
    expect(row.last_error).toBeNull()
    expect(JSON.parse(row.last_summary).autoMatched).toBe(1)
  })

  it('dedupes the same statement across runs and never pays twice', async () => {
    const { db, customerId, projectId } = makeDb()
    const id = makeInvoice(db, customerId, projectId, 50000)
    const conn = insertConn(db)
    const xml = camtXml([{ amount: '500.00', ref: buildReference(id, IBAN), acctSvcrRef: 'B1' }])
    const { provider } = fakeProvider([{ ref: 'r1', filename: 'jan.xml', xml }])

    await syncConnection(db, conn, provider)
    const second = await syncConnection(db, conn, provider)

    expect(second).toMatchObject({ imported: 1, duplicates: 1, autoMatched: 0 })
    expect((db.prepare('SELECT COUNT(*) n FROM bank_transactions').get() as { n: number }).n).toBe(
      1
    )
    expect(
      (db.prepare("SELECT COUNT(*) n FROM invoices WHERE status = 'paid'").get() as { n: number }).n
    ).toBe(1)
  })

  it('records a provider failure without throwing', async () => {
    const { db } = makeDb()
    const conn = insertConn(db)
    const { provider } = fakeProvider([], { throwMsg: 'bank unreachable' })

    const result = await syncConnection(db, conn, provider)
    expect(result.errors).toEqual(['bank unreachable'])

    const row = db
      .prepare('SELECT last_status, last_error FROM bank_connections WHERE id = ?')
      .get(conn.id) as {
      last_status: string
      last_error: string
    }
    expect(row.last_status).toBe('error')
    expect(row.last_error).toContain('bank unreachable')
  })

  it('records a bad statement per-file but still imports the good ones', async () => {
    const { db, customerId, projectId } = makeDb()
    const id = makeInvoice(db, customerId, projectId, 50000)
    const conn = insertConn(db)
    const good = camtXml([{ amount: '500.00', ref: buildReference(id, IBAN), acctSvcrRef: 'B1' }])
    const { provider } = fakeProvider([
      { ref: 'bad', filename: 'broken.xml', xml: '<not-camt/>' },
      { ref: 'good', filename: 'jan.xml', xml: good }
    ])

    const result = await syncConnection(db, conn, provider)
    expect(result.imported).toBe(1)
    expect(result.autoMatched).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('broken.xml')
  })
})

describe('runBankSync', () => {
  it('only syncs active connections', async () => {
    const { db } = makeDb()
    insertConn(db, { provider: 'ebics', status: 'pending' })
    await runBankSync(db)
    // pending ebics connection is skipped -> never touched
    const row = db
      .prepare('SELECT last_sync_at, last_status FROM bank_connections LIMIT 1')
      .get() as {
      last_sync_at: string | null
      last_status: string | null
    }
    expect(row.last_sync_at).toBeNull()
    expect(row.last_status).toBeNull()
  })
})

describe('folderProvider', () => {
  it('lists *.xml sorted and moves acked files to processed/', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chohle-bank-'))
    writeFileSync(join(dir, 'b.xml'), camtXml([{ amount: '10.00', acctSvcrRef: 'B' }]))
    writeFileSync(join(dir, 'a.xml'), camtXml([{ amount: '20.00', acctSvcrRef: 'A' }]))
    writeFileSync(join(dir, 'note.txt'), 'ignore me')

    const statements = await folderProvider.fetchStatements({ dir }, null)
    expect(statements.map((s) => s.filename)).toEqual(['a.xml', 'b.xml'])

    await folderProvider.ack!({ dir }, statements[0]!.ref)
    expect(readdirSync(dir).sort()).toEqual(['b.xml', 'note.txt', 'processed'])
    expect(readdirSync(join(dir, 'processed'))).toEqual(['a.xml'])
  })

  it('throws a clear error when the folder is missing', async () => {
    await expect(folderProvider.fetchStatements({ dir: '/no/such/dir/x' }, null)).rejects.toThrow(
      /Cannot read folder/
    )
  })
})

describe('sanitizeConfig', () => {
  it('strips secret keys from a decrypted config', () => {
    const stored = encryptSecret(
      JSON.stringify({ dir: '/data/in', userKeys: 'SECRET', hostId: 'H' })
    )
    expect(sanitizeConfig(stored)).toEqual({ dir: '/data/in', hostId: 'H' })
  })
})
