// The assistant's commit path is the only place it writes, and it only ever
// creates (never deletes/updates). These tests exercise that path end-to-end on
// an in-memory db: new-customer + invoice, existing-customer invoice, totals,
// and that a bad batch rolls back wholly.
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../server/utils/migrate'
import { commitActions, type ProposedAction } from '../server/utils/assistant/commit'

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare('UPDATE sender SET vat_registered = 1 WHERE id = 1').run()
  return db
}

let db: ReturnType<typeof makeDb>
beforeEach(() => {
  db = makeDb()
})

describe('assistant commitActions', () => {
  it('creates a customer', () => {
    const res = commitActions(db, [
      { type: 'create_customer', customer: { name: 'Müller Bau', city: 'Zürich' } }
    ])
    expect(res.customers).toHaveLength(1)
    const row = db
      .prepare('SELECT name, city FROM customers WHERE id = ?')
      .get(res.customers[0]!.id)
    expect(row).toMatchObject({ name: 'Müller Bau', city: 'Zürich' })
  })

  it('creates a new customer + project + draft invoice + items with correct totals', () => {
    const action: ProposedAction = {
      type: 'create_invoice',
      newCustomer: { name: 'Café Zentral', paymentTermDays: 30 },
      title: 'Consulting June',
      lines: [{ description: 'Consulting', quantity: 8, unitPriceChf: 150, mwstPercent: 8.1 }]
    }
    const res = commitActions(db, [action])

    expect(res.customers).toHaveLength(1)
    expect(res.projects).toHaveLength(1)
    expect(res.invoices).toHaveLength(1)

    // 8 * 150 = 1200 CHF net; + 8.1% MWST = 1297.20 → 129720 Rappen.
    expect(res.invoices[0]!.totalRappen).toBe(129720)

    const inv = db
      .prepare('SELECT customer_id, project_id, number, status, title FROM invoices WHERE id = ?')
      .get(res.invoices[0]!.id) as Record<string, unknown>
    expect(inv.number).toBe('') // draft, number assigned later in the UI
    expect(inv.status).toBe('draft')
    expect(inv.project_id).toBe(res.projects[0]!.id)

    const items = db
      .prepare(
        'SELECT description, quantity, unit_price_rappen, mwst_percent FROM invoice_items WHERE invoice_id = ?'
      )
      .all(res.invoices[0]!.id)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      description: 'Consulting',
      quantity: 8,
      unit_price_rappen: 15000,
      mwst_percent: 8.1
    })

    // The auto-created project is a sales/active project for that customer.
    const proj = db
      .prepare('SELECT customer_id, direction, stage FROM projects WHERE id = ?')
      .get(res.projects[0]!.id)
    expect(proj).toMatchObject({
      customer_id: res.customers[0]!.id,
      direction: 'sales',
      stage: 'active'
    })
  })

  it('invoices an existing customer by id (no new customer created)', () => {
    const customerId = Number(
      db.prepare("INSERT INTO customers (type, name) VALUES ('company', 'ACME AG')").run()
        .lastInsertRowid
    )
    const res = commitActions(db, [
      {
        type: 'create_invoice',
        customerId,
        lines: [{ description: 'Flat fee', quantity: 1, unitPriceChf: 500 }]
      }
    ])
    expect(res.customers).toHaveLength(0) // reused, not created
    expect(
      (
        db.prepare('SELECT customer_id FROM invoices WHERE id = ?').get(res.invoices[0]!.id) as {
          customer_id: number
        }
      ).customer_id
    ).toBe(customerId)
  })

  it('rolls the whole batch back when one action is invalid', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n
    expect(() =>
      commitActions(db, [
        { type: 'create_customer', customer: { name: 'Should Not Persist AG' } },
        // invalid: invoice with no line items → throws, rolling back action 1 too
        { type: 'create_invoice', newCustomer: { name: 'Nor This AG' }, lines: [] }
      ])
    ).toThrow()

    const after = (db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n
    expect(after).toBe(before)
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toMatchObject({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toMatchObject({ n: 0 })
  })
})
