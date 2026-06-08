// The tax-year report gatherer + ZIP builder. Seeds an in-memory db with income
// (a paid invoice + a salary payment) and two expenses (one with VAT + a receipt,
// one without), and checks the Erfolgsrechnung totals, the VAT summary, the
// missing-receipt detection, and the ZIP contents.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { runMigrations } from '../server/utils/migrate'
import { buildTaxReport } from '../server/utils/taxReport'
import { buildTaxExportZip } from '../server/utils/taxExportZip'

function makeDb() {
  const db = new Database(':memory:')
  runMigrations(db)
  db.pragma('foreign_keys = OFF') // seed without projects/sources scaffolding
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  db.prepare('UPDATE sender SET name = ?, vat_registered = 1 WHERE id = 1').run('chohle GmbH')

  // Income: a paid invoice (with items so VAT can be recomputed) + a salary payment.
  const customerId = Number(
    db.prepare("INSERT INTO customers (type, name) VALUES ('company','ACME AG')").run()
      .lastInsertRowid
  )
  const invId = Number(
    db
      .prepare(
        `INSERT INTO invoices (customer_id, project_id, number, status, issue_date, due_date, paid_at, total_rappen)
         VALUES (?, 1, '2024-001', 'paid', '2024-02-01', '2024-03-01', '2024-02-15', 108100)`
      )
      .run(customerId).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
     VALUES (?, 'Consulting', 10, 'h', 10000, 0, 8.1, 0)`
  ).run(invId)

  const srcId = Number(
    db
      .prepare(
        "INSERT INTO income_sources (company, salary_rappen, payout_day, canton) VALUES ('Job AG', 500000, 25, 'ZH')"
      )
      .run().lastInsertRowid
  )
  db.prepare(
    "INSERT INTO income_payments (source_id, month, date, amount_rappen) VALUES (?, '2024-03', '2024-03-25', 500000)"
  ).run(srcId)

  // Expenses: one with VAT + a receipt, one without a receipt.
  const catId = Number(
    db
      .prepare(
        "INSERT INTO categories (name, type, color, icon) VALUES ('Büro','expense','#000','x')"
      )
      .run().lastInsertRowid
  )
  const e1 = Number(
    db
      .prepare(
        "INSERT INTO expenses (title, amount_rappen, date, category_id, vendor, vat_rate) VALUES ('Toner', 10810, '2024-04-10', ?, 'Migros', 8.1)"
      )
      .run(catId).lastInsertRowid
  )
  db.prepare(
    "INSERT INTO expenses (title, amount_rappen, date, category_id, vat_rate) VALUES ('Kaffee', 5000, '2024-05-02', ?, 0)"
  ).run(catId)

  // A real receipt file on disk so the ZIP can include it.
  db.prepare(
    "INSERT INTO attachments (expense_id, filename, stored_name, mime_type, size) VALUES (?, 'beleg.jpg', 'receipt1.jpg', 'image/jpeg', 4)"
  ).run(e1)

  return db
}

let db: ReturnType<typeof makeDb>
beforeEach(() => {
  const up = mkdtempSync(join(tmpdir(), 'chohle-up-'))
  process.env.UPLOADS_PATH = up
  writeFileSync(join(up, 'receipt1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  db = makeDb()
})

describe('buildTaxReport', () => {
  it('computes the Erfolgsrechnung, VAT and missing receipts', () => {
    const r = buildTaxReport(db, 2024)

    expect(r.income.invoiceRappen).toBe(108100)
    expect(r.income.salaryRappen).toBe(500000)
    expect(r.income.totalRappen).toBe(608100)
    expect(r.expenses.totalRappen).toBe(15810)
    expect(r.netRappen).toBe(608100 - 15810)

    expect(r.expenses.byCategory).toEqual([{ name: 'Büro', totalRappen: 15810 }])

    expect(r.vat.registered).toBe(true)
    expect(r.vat.outputByRate).toEqual([{ rate: 8.1, vatRappen: 8100 }])
    expect(r.vat.outputRappen).toBe(8100)
    expect(r.vat.inputRappen).toBe(810) // 10810 * 8.1 / 108.1
    expect(r.vat.netVatRappen).toBe(7290)

    expect(r.missingReceipts).toHaveLength(1)
    expect(r.missingReceipts[0]!.title).toBe('Kaffee')
  })

  it('ignores another year', () => {
    expect(buildTaxReport(db, 2023).income.totalRappen).toBe(0)
    expect(buildTaxReport(db, 2023).expenses.totalRappen).toBe(0)
  })
})

describe('buildTaxExportZip', () => {
  it('bundles the report PDF, the CSV journal and the receipt', async () => {
    const { filename, buffer } = await buildTaxExportZip(db, 2024)
    expect(filename).toBe('Steuerexport-2024.zip')
    const entries = Object.keys(unzipSync(new Uint8Array(buffer)))
    expect(entries).toContain('Steuerexport-2024.pdf')
    expect(entries).toContain('buchungen-2024.csv')
    expect(entries.some((e) => e.startsWith('belege/0001_'))).toBe(true)
  })
})
