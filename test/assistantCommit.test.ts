// The assistant's commit path is the only place it writes; it only creates or
// edits (never deletes), and edits only change fields. These tests exercise the
// create + edit handlers on an in-memory db and the atomic rollback.
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

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n

describe('assistant commit — create', () => {
  it('creates a customer', () => {
    const res = commitActions(db, [
      { type: 'create_customer', customer: { name: 'Müller Bau', city: 'Zürich' } }
    ])
    expect(res.created).toHaveLength(1)
    expect(res.created[0]).toMatchObject({ kind: 'customer', label: 'Müller Bau' })
  })

  it('creates customer + project + draft invoice with items', () => {
    const res = commitActions(db, [
      {
        type: 'create_invoice',
        newCustomer: { name: 'Café Zentral' },
        title: 'June',
        lines: [{ description: 'Consulting', quantity: 8, unitPriceChf: 150, mwstPercent: 8.1 }]
      }
    ])
    const kinds = res.created.map((r) => r.kind)
    expect(kinds).toEqual(expect.arrayContaining(['customer', 'project', 'invoice']))
    const inv = res.created.find((r) => r.kind === 'invoice')!
    const item = db
      .prepare('SELECT quantity, unit_price_rappen FROM invoice_items WHERE invoice_id = ?')
      .get(inv.id)
    expect(item).toMatchObject({ quantity: 8, unit_price_rappen: 15000 })
    expect(db.prepare('SELECT status FROM invoices WHERE id = ?').get(inv.id)).toMatchObject({
      status: 'draft'
    })
  })

  it('creates a quote with computed total and references', () => {
    const customerId = Number(
      db.prepare("INSERT INTO customers (type, name) VALUES ('company','ACME AG')").run()
        .lastInsertRowid
    )
    const res = commitActions(db, [
      {
        type: 'create_quote',
        customerId,
        title: 'Website',
        lines: [{ description: 'Build', quantity: 8, unitPriceChf: 150, mwstPercent: 8.1 }],
        references: [{ label: 'Demo', url: 'https://x.ch' }]
      }
    ])
    const q = res.created.find((r) => r.kind === 'quote')!
    // 8 * 150 net + 8.1% MWST = 129720 Rappen.
    expect(db.prepare('SELECT total_rappen FROM quotes WHERE id = ?').get(q.id)).toMatchObject({
      total_rappen: 129720
    })
    expect(count(`SELECT COUNT(*) AS n FROM quote_items WHERE quote_id = ${q.id}`)).toBe(1)
    expect(count(`SELECT COUNT(*) AS n FROM quote_references WHERE quote_id = ${q.id}`)).toBe(1)
  })

  it('creates an article (CHF -> rappen)', () => {
    const res = commitActions(db, [
      { type: 'create_article', name: 'Hour', unit: 'h', price: 150, mwst: 8.1 }
    ])
    expect(
      db.prepare('SELECT default_price_rappen FROM articles WHERE id = ?').get(res.created[0]!.id)
    ).toMatchObject({ default_price_rappen: 15000 })
  })

  it('creates the first signature as default', () => {
    const res = commitActions(db, [
      { type: 'create_signature', name: 'Default', contentHtml: '<p>hi</p>' }
    ])
    expect(
      db.prepare('SELECT is_default FROM signatures WHERE id = ?').get(res.created[0]!.id)
    ).toMatchObject({ is_default: 1 })
  })

  it('logs an expense and resolves the category by name', () => {
    const catId = Number(
      db
        .prepare(
          "INSERT INTO categories (name, type, color, icon) VALUES ('Software','expense','#000','x')"
        )
        .run().lastInsertRowid
    )
    const res = commitActions(db, [
      {
        type: 'create_expense',
        title: 'Adobe',
        amount: 65,
        date: '2026-06-01',
        categoryName: 'Software'
      }
    ])
    expect(
      db
        .prepare('SELECT amount_rappen, category_id FROM expenses WHERE id = ?')
        .get(res.created[0]!.id)
    ).toMatchObject({ amount_rappen: 6500, category_id: catId })
  })
})

describe('assistant commit — edit', () => {
  it('edits a customer field, keeping the rest', () => {
    const id = Number(
      db
        .prepare("INSERT INTO customers (type, name, city) VALUES ('company','ACME AG','Zug')")
        .run().lastInsertRowid
    )
    const res = commitActions(db, [{ type: 'edit_customer', id, changes: { city: 'Bern' } }])
    expect(res.updated[0]).toMatchObject({ kind: 'customer' })
    expect(db.prepare('SELECT name, city FROM customers WHERE id = ?').get(id)).toMatchObject({
      name: 'ACME AG',
      city: 'Bern'
    })
  })

  it('replaces invoice line items on edit', () => {
    const created = commitActions(db, [
      {
        type: 'create_invoice',
        newCustomer: { name: 'Edit Co' },
        lines: [{ description: 'Old', quantity: 1, unitPriceChf: 100 }]
      }
    ])
    const id = created.created.find((r) => r.kind === 'invoice')!.id
    commitActions(db, [
      {
        type: 'edit_invoice',
        id,
        lines: [
          { description: 'New A', quantity: 2, unitPriceChf: 200 },
          { description: 'New B', quantity: 1, unitPriceChf: 50 }
        ]
      }
    ])
    expect(count(`SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id = ${id}`)).toBe(2)
  })

  it('renames a signature', () => {
    const id = Number(
      db.prepare("INSERT INTO signatures (name) VALUES ('Old')").run().lastInsertRowid
    )
    commitActions(db, [{ type: 'edit_signature', id, name: 'New name' }])
    expect(db.prepare('SELECT name FROM signatures WHERE id = ?').get(id)).toMatchObject({
      name: 'New name'
    })
  })
})

describe('assistant commit — safety', () => {
  it('rolls the whole batch back when one action is invalid', () => {
    const before = count('SELECT COUNT(*) AS n FROM customers')
    expect(() =>
      commitActions(db, [
        { type: 'create_customer', customer: { name: 'Should Not Persist AG' } },
        { type: 'create_invoice', newCustomer: { name: 'Nor This AG' }, lines: [] }
      ])
    ).toThrow()
    expect(count('SELECT COUNT(*) AS n FROM customers')).toBe(before)
    expect(count('SELECT COUNT(*) AS n FROM invoices')).toBe(0)
  })

  it('rejects an unknown / non-create-edit action type', () => {
    expect(() =>
      commitActions(db, [{ type: 'delete_customer', id: 1 } as unknown as ProposedAction])
    ).toThrow()
  })
})
