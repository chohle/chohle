// Conversion logic for quotes. The CRUD endpoints are thin and easier
// to exercise manually; the convert flow has the actual business rules
// (already-converted, declined, no-project, accept-stamp, item copy
// with position preserved) so that's where the test value is.

import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../server/utils/migrate'
import { QuoteConvertError, convertQuoteToInvoice } from '../server/utils/quotes'

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
     VALUES ('Website', ?, 'sales', 'proposal')`
  ).run(customerId)
  const projectId = Number(
    (db.prepare('SELECT id FROM projects ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )

  return { db, customerId, projectId }
}

function makeQuote(
  db: Database.Database,
  opts: {
    customerId: number
    projectId: number | null
    status?: string
    converted?: number | null
  }
) {
  db.prepare(
    `INSERT INTO quotes (customer_id, project_id, number, title, status, issue_date, valid_until, converted_invoice_id)
     VALUES (?, ?, 'Q-1', 'Marketing site', ?, '2026-05-01', '2026-06-01', ?)`
  ).run(opts.customerId, opts.projectId, opts.status ?? 'sent', opts.converted ?? null)
  const id = Number(
    (db.prepare('SELECT id FROM quotes ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )

  // Three items, positions 0/1/2 (intentionally inserted out of order
  // to verify the convert keeps ORDER BY position).
  const insert = db.prepare(
    `INSERT INTO quote_items
       (quote_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insert.run(id, 'Hosting', 12, 'month', 5000, 0, 8.1, 2)
  insert.run(id, 'Design', 1, 'pauschal', 250_000, 0, 8.1, 0)
  insert.run(id, 'Implementation', 40, 'h', 15_000, 10, 8.1, 1)

  return id
}

describe('convertQuoteToInvoice', () => {
  it('copies items in position order and stamps converted_invoice_id', () => {
    const { db, customerId, projectId } = makeDb()
    const quoteId = makeQuote(db, { customerId, projectId, status: 'accepted' })

    const { invoiceId } = convertQuoteToInvoice(db, quoteId)
    expect(invoiceId).toBeGreaterThan(0)

    const invoice = db
      .prepare('SELECT customer_id, project_id, title, status FROM invoices WHERE id = ?')
      .get(invoiceId) as { customer_id: number; project_id: number; title: string; status: string }
    expect(invoice.customer_id).toBe(customerId)
    expect(invoice.project_id).toBe(projectId)
    expect(invoice.title).toBe('Marketing site')
    expect(invoice.status).toBe('draft')

    const items = db
      .prepare(
        'SELECT description, quantity, position FROM invoice_items WHERE invoice_id = ? ORDER BY position'
      )
      .all(invoiceId) as Array<{ description: string; quantity: number; position: number }>
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.description)).toEqual(['Design', 'Implementation', 'Hosting'])
    expect(items.map((i) => i.position)).toEqual([0, 1, 2])

    const quote = db
      .prepare('SELECT converted_invoice_id, status, accepted_at FROM quotes WHERE id = ?')
      .get(quoteId) as {
      converted_invoice_id: number
      status: string
      accepted_at: string | null
    }
    expect(quote.converted_invoice_id).toBe(invoiceId)
    expect(quote.status).toBe('accepted')
    expect(quote.accepted_at).not.toBeNull()
  })

  it('flips a non-accepted quote to accepted on convert (the customer implicitly accepted)', () => {
    const { db, customerId, projectId } = makeDb()
    const quoteId = makeQuote(db, { customerId, projectId, status: 'sent' })

    convertQuoteToInvoice(db, quoteId)

    const quote = db.prepare('SELECT status FROM quotes WHERE id = ?').get(quoteId) as {
      status: string
    }
    expect(quote.status).toBe('accepted')
  })

  it('refuses to convert a quote that is already converted (409)', () => {
    const { db, customerId, projectId } = makeDb()
    // Seed a real invoice so the converted_invoice_id FK is satisfied;
    // setting it to a stale id would trip the FK before we even reach
    // the convert helper.
    const r = db
      .prepare(
        `INSERT INTO invoices (customer_id, project_id, number, title, issue_date, due_date)
         VALUES (?, ?, 'INV-prev', '', '2026-04-01', '2026-05-01')`
      )
      .run(customerId, projectId)
    const prevInvoiceId = Number(r.lastInsertRowid)
    const quoteId = makeQuote(db, {
      customerId,
      projectId,
      status: 'accepted',
      converted: prevInvoiceId
    })

    let caught: QuoteConvertError | undefined
    try {
      convertQuoteToInvoice(db, quoteId)
    } catch (e) {
      caught = e as QuoteConvertError
    }
    expect(caught).toBeInstanceOf(QuoteConvertError)
    expect(caught?.statusCode).toBe(409)
    expect(caught?.message).toMatch(/already converted/)
  })

  it('refuses to convert a declined quote (422)', () => {
    const { db, customerId, projectId } = makeDb()
    const quoteId = makeQuote(db, { customerId, projectId, status: 'declined' })

    let caught: QuoteConvertError | undefined
    try {
      convertQuoteToInvoice(db, quoteId)
    } catch (e) {
      caught = e as QuoteConvertError
    }
    expect(caught?.statusCode).toBe(422)
    expect(caught?.message).toMatch(/declined/)
  })

  it('refuses to convert a quote with no project (422)', () => {
    const { db, customerId } = makeDb()
    const quoteId = makeQuote(db, { customerId, projectId: null, status: 'accepted' })

    let caught: QuoteConvertError | undefined
    try {
      convertQuoteToInvoice(db, quoteId)
    } catch (e) {
      caught = e as QuoteConvertError
    }
    expect(caught?.statusCode).toBe(422)
    expect(caught?.message).toMatch(/project/)
  })

  it('throws 404 when the quote does not exist', () => {
    const { db } = makeDb()
    let caught: QuoteConvertError | undefined
    try {
      convertQuoteToInvoice(db, 99_999)
    } catch (e) {
      caught = e as QuoteConvertError
    }
    expect(caught?.statusCode).toBe(404)
  })
})

describe('convertQuoteToInvoice transactional safety', () => {
  beforeEach(() => {
    // No-op; each test sets up its own DB.
  })

  it('does not leave a partial invoice if the items copy fails', () => {
    const { db, customerId, projectId } = makeDb()
    const quoteId = makeQuote(db, { customerId, projectId, status: 'accepted' })

    // Sabotage: drop the invoice_items table so the INSERT-SELECT fails.
    db.exec('DROP TABLE invoice_items')

    expect(() => convertQuoteToInvoice(db, quoteId)).toThrow()

    const invoiceCount = (db.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number }).n
    expect(invoiceCount).toBe(0)

    const quote = db
      .prepare('SELECT converted_invoice_id, status FROM quotes WHERE id = ?')
      .get(quoteId) as { converted_invoice_id: number | null; status: string }
    expect(quote.converted_invoice_id).toBeNull()
    expect(quote.status).toBe('accepted')
  })
})
