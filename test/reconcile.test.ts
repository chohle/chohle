// Matching rules for bank reconciliation. The endpoints are thin shells over
// reconcileStatement / decideMatch, so the business logic (deterministic
// auto-pay, amount-mismatch + unsent + fuzzy suggestions, dedupe on re-import)
// is asserted here against an in-memory db.

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../server/utils/migrate'
import { buildReference } from '../server/utils/qrReference'
import {
  ReconcileError,
  confirmTransaction,
  decideMatch,
  deleteImport,
  ignoreTransaction,
  reconcileStatement
} from '../server/utils/reconcile'
import type { ParsedCredit, ParsedStatement } from '../server/utils/camt'

const QR_IBAN = 'CH4431999123000889012'

function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  // VAT off so an invoice's total equals the bare line net -> easy amounts.
  db.prepare('INSERT OR IGNORE INTO sender (id, iban, vat_registered) VALUES (1, ?, 0)').run(
    QR_IBAN
  )
  return db
}

function makeCustomer(
  db: Database.Database,
  name: string
): { customerId: number; projectId: number } {
  db.prepare(
    `INSERT INTO customers (type, name, country, language) VALUES ('company', ?, 'CH', 'de')`
  ).run(name)
  const customerId = Number(
    (db.prepare('SELECT id FROM customers ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  db.prepare(
    `INSERT INTO projects (name, customer_id, direction, stage) VALUES ('P', ?, 'sales', 'proposal')`
  ).run(customerId)
  const projectId = Number(
    (db.prepare('SELECT id FROM projects ORDER BY id DESC LIMIT 1').get() as { id: number }).id
  )
  return { customerId, projectId }
}

function makeInvoice(
  db: Database.Database,
  opts: { customerId: number; projectId: number; status: string; amountRappen: number }
): number {
  const r = db
    .prepare(
      `INSERT INTO invoices (customer_id, project_id, number, title, status, issue_date, due_date)
       VALUES (?, ?, '', '', ?, '2026-01-01', '2026-02-01')`
    )
    .run(opts.customerId, opts.projectId, opts.status)
  const id = Number(r.lastInsertRowid)
  db.prepare(
    `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
     VALUES (?, '', 1, '', ?, 0, 0, 0)`
  ).run(id, opts.amountRappen)
  return id
}

function credit(over: Partial<ParsedCredit> = {}): ParsedCredit {
  return {
    bookingDate: '2026-01-15',
    valueDate: '2026-01-16',
    amountRappen: 500000,
    currency: 'CHF',
    reference: null,
    endToEndId: null,
    debtorName: null,
    acctSvcrRef: 'BANKREF-1',
    ...over
  }
}

function statement(credits: ParsedCredit[], over: Partial<ParsedStatement> = {}): ParsedStatement {
  return {
    iban: QR_IBAN,
    version: 8,
    statementId: 'STMT-1',
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    credits,
    ...over
  }
}

describe('decideMatch', () => {
  it('auto-matches a sent invoice when the reference and amount agree', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    const c = credit({ reference: buildReference(id, QR_IBAN), amountRappen: 500000 })
    expect(decideMatch(db, c, false)).toEqual({ status: 'matched', invoiceId: id })
  })

  it('suggests (amount mismatch) when the reference resolves but the amount differs', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    const c = credit({ reference: buildReference(id, QR_IBAN), amountRappen: 499900 })
    expect(decideMatch(db, c, false)).toEqual({
      status: 'suggested',
      invoiceId: id,
      reason: 'amount_mismatch'
    })
  })

  it('suggests (unsent) when the reference points at a draft invoice', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'draft', amountRappen: 500000 })
    const c = credit({ reference: buildReference(id, QR_IBAN), amountRappen: 500000 })
    expect(decideMatch(db, c, false)).toEqual({
      status: 'suggested',
      invoiceId: id,
      reason: 'unsent'
    })
  })

  it('does not touch an already-paid invoice (unmatched)', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'paid', amountRappen: 500000 })
    const c = credit({ reference: buildReference(id, QR_IBAN), amountRappen: 500000 })
    expect(decideMatch(db, c, false)).toEqual({ status: 'unmatched' })
  })

  it('falls back to a fuzzy suggestion on a unique amount match without a reference', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 123400 })
    const c = credit({ amountRappen: 123400 })
    expect(decideMatch(db, c, false)).toEqual({
      status: 'suggested',
      invoiceId: id,
      reason: 'fuzzy'
    })
  })

  it('leaves an ambiguous fuzzy match unmatched, but the debtor name disambiguates', () => {
    const db = makeDb()
    const a = makeCustomer(db, 'ACME AG')
    const b = makeCustomer(db, 'Globex GmbH')
    makeInvoice(db, {
      customerId: a.customerId,
      projectId: a.projectId,
      status: 'sent',
      amountRappen: 777000
    })
    const idB = makeInvoice(db, {
      customerId: b.customerId,
      projectId: b.projectId,
      status: 'sent',
      amountRappen: 777000
    })

    expect(decideMatch(db, credit({ amountRappen: 777000 }), false)).toEqual({
      status: 'unmatched'
    })
    expect(
      decideMatch(db, credit({ amountRappen: 777000, debtorName: 'Globex GmbH' }), false)
    ).toEqual({
      status: 'suggested',
      invoiceId: idB,
      reason: 'fuzzy'
    })
  })

  it('is unmatched when nothing has that amount', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    expect(decideMatch(db, credit({ amountRappen: 999999 }), false)).toEqual({
      status: 'unmatched'
    })
  })

  it('ignores a garbled (non-chohle) reference and still fuzzy-matches', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    const c = credit({ reference: 'NOT-A-REAL-REF', amountRappen: 500000 })
    expect(decideMatch(db, c, false)).toEqual({
      status: 'suggested',
      invoiceId: id,
      reason: 'fuzzy'
    })
  })
})

describe('reconcileStatement', () => {
  it('auto-pays an exact match and reports the summary', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const paidId = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    const openId = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 250000 })

    const summary = reconcileStatement(
      db,
      statement([
        credit({
          reference: buildReference(paidId, QR_IBAN),
          amountRappen: 500000,
          bookingDate: '2026-01-15'
        }),
        credit({ amountRappen: 250000, acctSvcrRef: 'BANKREF-2' }), // fuzzy -> suggested
        credit({ amountRappen: 4242, acctSvcrRef: 'BANKREF-3' }) // unmatched
      ]),
      'jan.xml'
    )

    expect(summary).toMatchObject({
      total: 3,
      inserted: 3,
      duplicates: 0,
      autoMatched: 1,
      suggested: 1,
      unmatched: 1
    })

    const paid = db
      .prepare('SELECT status, paid_at, total_rappen FROM invoices WHERE id = ?')
      .get(paidId)
    expect(paid).toEqual({ status: 'paid', paid_at: '2026-01-15', total_rappen: 500000 })
    // The fuzzy/suggested invoice stays sent until confirmed.
    expect(
      (db.prepare('SELECT status FROM invoices WHERE id = ?').get(openId) as { status: string })
        .status
    ).toBe('sent')
    expect(
      (
        db.prepare('SELECT tx_count FROM bank_imports WHERE id = ?').get(summary.importId) as {
          tx_count: number
        }
      ).tx_count
    ).toBe(3)
  })

  it('dedupes an overlapping re-import and never pays twice', () => {
    const db = makeDb()
    const { customerId, projectId } = makeCustomer(db, 'ACME AG')
    const id = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    const stmt = statement([
      credit({ reference: buildReference(id, QR_IBAN), amountRappen: 500000 })
    ])

    const first = reconcileStatement(db, stmt, 'jan.xml')
    expect(first).toMatchObject({ inserted: 1, autoMatched: 1, duplicates: 0 })

    const second = reconcileStatement(db, stmt, 'jan-again.xml')
    expect(second).toMatchObject({ inserted: 0, autoMatched: 0, duplicates: 1 })

    expect((db.prepare('SELECT COUNT(*) n FROM bank_transactions').get() as { n: number }).n).toBe(
      1
    )
    expect(
      (db.prepare('SELECT COUNT(*) n FROM invoices WHERE status = ?').get('paid') as { n: number })
        .n
    ).toBe(1)
  })

  it('rejects a statement for a different account', () => {
    const db = makeDb()
    let caught: ReconcileError | undefined
    try {
      reconcileStatement(db, statement([credit()], { iban: 'CH9300762011623852957' }), 'x.xml')
    } catch (e) {
      caught = e as ReconcileError
    }
    expect(caught).toBeInstanceOf(ReconcileError)
    expect(caught?.statusCode).toBe(422)
  })
})

// Seed a single fuzzy/suggested transaction and return its id alongside the db.
function withSuggestion() {
  const db = makeDb()
  const { customerId, projectId } = makeCustomer(db, 'ACME AG')
  const invoiceId = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
  const summary = reconcileStatement(db, statement([credit({ amountRappen: 500000 })]), 'jan.xml')
  const txId = (
    db.prepare("SELECT id FROM bank_transactions WHERE status = 'suggested'").get() as {
      id: number
    }
  ).id
  return { db, txId, invoiceId, importId: summary.importId, customerId, projectId }
}

describe('confirmTransaction', () => {
  it('marks the invoice paid with the booking date and links the transaction', () => {
    const { db, txId, invoiceId } = withSuggestion()
    expect(confirmTransaction(db, txId, invoiceId)).toEqual({ invoiceId })

    expect(
      db.prepare('SELECT status, paid_at, total_rappen FROM invoices WHERE id = ?').get(invoiceId)
    ).toEqual({
      status: 'paid',
      paid_at: '2026-01-15',
      total_rappen: 500000
    })
    expect(
      db.prepare('SELECT status, invoice_id FROM bank_transactions WHERE id = ?').get(txId)
    ).toEqual({
      status: 'matched',
      invoice_id: invoiceId
    })
  })

  it('can be pointed at a different invoice than the one suggested', () => {
    const { db, txId, customerId, projectId } = withSuggestion()
    const other = makeInvoice(db, { customerId, projectId, status: 'sent', amountRappen: 500000 })
    confirmTransaction(db, txId, other)
    expect(
      (
        db.prepare('SELECT invoice_id FROM bank_transactions WHERE id = ?').get(txId) as {
          invoice_id: number
        }
      ).invoice_id
    ).toBe(other)
    expect(
      (db.prepare('SELECT status FROM invoices WHERE id = ?').get(other) as { status: string })
        .status
    ).toBe('paid')
  })

  it('refuses to confirm an already-matched transaction (409)', () => {
    const { db, txId, invoiceId } = withSuggestion()
    confirmTransaction(db, txId, invoiceId)
    expect(() => confirmTransaction(db, txId, invoiceId)).toThrowError(/already/)
  })

  it('refuses to confirm against an already-paid invoice (409)', () => {
    const { db, txId, customerId, projectId } = withSuggestion()
    const paid = makeInvoice(db, { customerId, projectId, status: 'paid', amountRappen: 500000 })
    let caught: ReconcileError | undefined
    try {
      confirmTransaction(db, txId, paid)
    } catch (e) {
      caught = e as ReconcileError
    }
    expect(caught?.statusCode).toBe(409)
  })

  it('404s for a missing transaction or invoice', () => {
    const { db, txId, invoiceId } = withSuggestion()
    expect(() => confirmTransaction(db, 9999, invoiceId)).toThrowError(/Transaction not found/)
    expect(() => confirmTransaction(db, txId, 9999)).toThrowError(/Invoice not found/)
  })
})

describe('ignoreTransaction', () => {
  it('marks a suggestion ignored and drops its invoice link', () => {
    const { db, txId } = withSuggestion()
    ignoreTransaction(db, txId)
    expect(
      db.prepare('SELECT status, invoice_id FROM bank_transactions WHERE id = ?').get(txId)
    ).toEqual({
      status: 'ignored',
      invoice_id: null
    })
  })

  it('refuses to ignore a matched transaction (409)', () => {
    const { db, txId, invoiceId } = withSuggestion()
    confirmTransaction(db, txId, invoiceId)
    let caught: ReconcileError | undefined
    try {
      ignoreTransaction(db, txId)
    } catch (e) {
      caught = e as ReconcileError
    }
    expect(caught?.statusCode).toBe(409)
  })
})

describe('deleteImport', () => {
  it('cascades to the import transactions when none are confirmed', () => {
    const { db, txId, importId } = withSuggestion()
    deleteImport(db, importId)
    expect(db.prepare('SELECT id FROM bank_imports WHERE id = ?').get(importId)).toBeUndefined()
    expect(db.prepare('SELECT id FROM bank_transactions WHERE id = ?').get(txId)).toBeUndefined()
  })

  it('is blocked while a transaction is a confirmed match (409)', () => {
    const { db, txId, invoiceId, importId } = withSuggestion()
    confirmTransaction(db, txId, invoiceId)
    let caught: ReconcileError | undefined
    try {
      deleteImport(db, importId)
    } catch (e) {
      caught = e as ReconcileError
    }
    expect(caught?.statusCode).toBe(409)
    expect(db.prepare('SELECT id FROM bank_imports WHERE id = ?').get(importId)).toBeTruthy()
  })
})
