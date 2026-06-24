// Bank reconciliation: turn the credits parsed out of a camt.053 statement
// (see server/utils/camt.ts) into matched invoices. Factored out of the import
// endpoint so the matching rules are unit-testable against an in-memory db,
// the same way quotes.ts is — see test/reconcile.test.ts.
//
// Matching order per credit (mirrors docs/features/bank-reconciliation.md):
//   1. deterministic reference -> invoice; amount == live total -> auto-pay
//   2. deterministic reference, amount differs -> suggest (amount mismatch)
//   3. no/garbled reference -> fuzzy by amount (+ debtor name) -> suggest
//   4. nothing -> unmatched (manual queue)
// Only an exact deterministic match auto-pays; everything else is a suggestion
// the owner confirms, so a wrong guess never silently marks an invoice paid.

import { createHash } from 'node:crypto'
import type { Database } from 'better-sqlite3'
// Explicit imports (not Nitro auto-imports) so this module is unit-testable
// under vitest, where auto-imports are not wired up.
import { computeInvoiceTotals } from '../../shared/utils/invoice'
import type { ParsedCredit, ParsedStatement } from './camt'
import { parseReference } from './qrReference'

export class ReconcileError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ReconcileError'
  }
}

export type SuggestReason = 'amount_mismatch' | 'unsent' | 'fuzzy'

export type MatchOutcome =
  | { status: 'matched'; invoiceId: number }
  | { status: 'suggested'; invoiceId: number; reason: SuggestReason }
  | { status: 'unmatched' }

export interface ImportSummary {
  importId: number
  /** credits in the statement */
  total: number
  /** new transactions stored (not already seen) */
  inserted: number
  /** credits skipped because an identical transaction was already imported */
  duplicates: number
  autoMatched: number
  suggested: number
  unmatched: number
}

interface ItemRow {
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}

function senderVat(db: Database): boolean {
  const s = db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
    | { vat_registered: number }
    | undefined
  return !!s?.vat_registered
}

/** Compute an invoice's current total from its line items (in rappen). */
function liveTotalRappen(db: Database, invoiceId: number, vat: boolean): number {
  const items = db
    .prepare(
      'SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?'
    )
    .all(invoiceId) as ItemRow[]
  return computeInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })),
    vat
  ).totalRappen
}

/** A statement transaction is the same payment if these four agree. */
export function dedupeHash(credit: ParsedCredit): string {
  return createHash('sha256')
    .update(
      [
        credit.acctSvcrRef ?? '',
        credit.bookingDate,
        String(credit.amountRappen),
        credit.reference ?? ''
      ].join('|')
    )
    .digest('hex')
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function namesOverlap(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x))
}

/**
 * Decide what to do with a single credit, without writing anything. Pure with
 * respect to the credit (it only reads invoices), so the matching rules can be
 * asserted directly. vat is the sender's VAT flag, needed to recompute totals.
 */
export function decideMatch(db: Database, credit: ParsedCredit, vat: boolean): MatchOutcome {
  const invoiceId = credit.reference ? parseReference(credit.reference) : null

  if (invoiceId !== null) {
    const inv = db.prepare('SELECT id, status FROM invoices WHERE id = ?').get(invoiceId) as
      | { id: number; status: string }
      | undefined
    if (inv) {
      // A reference resolving to an already-paid invoice is almost always a
      // re-seen payment the dedupe missed (different bank ref). Leave it for a
      // human rather than touching the settled invoice.
      if (inv.status === 'paid') return { status: 'unmatched' }
      // Not yet sent: the amount may match, but the invoice isn't live — let
      // the owner confirm rather than skipping the 'sent' step.
      if (inv.status !== 'sent') return { status: 'suggested', invoiceId, reason: 'unsent' }
      const total = liveTotalRappen(db, invoiceId, vat)
      if (total === credit.amountRappen) return { status: 'matched', invoiceId }
      return { status: 'suggested', invoiceId, reason: 'amount_mismatch' }
    }
    // Reference parsed but no such invoice -> fall through to fuzzy.
  }

  return fuzzyMatch(db, credit, vat)
}

/** Fuzzy fallback: an open ('sent') invoice whose live total equals the credit. */
function fuzzyMatch(db: Database, credit: ParsedCredit, vat: boolean): MatchOutcome {
  const open = db
    .prepare(
      `SELECT i.id AS id, c.name AS customer_name
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status = 'sent'`
    )
    .all() as Array<{ id: number; customer_name: string }>

  const amountMatches = open.filter((o) => liveTotalRappen(db, o.id, vat) === credit.amountRappen)
  if (amountMatches.length === 0) return { status: 'unmatched' }
  if (amountMatches.length === 1) {
    return { status: 'suggested', invoiceId: amountMatches[0]!.id, reason: 'fuzzy' }
  }

  // Several invoices share the amount: only suggest if the debtor name picks
  // exactly one. Otherwise it is genuinely ambiguous -> manual queue.
  if (credit.debtorName) {
    const byName = amountMatches.filter((o) => namesOverlap(o.customer_name, credit.debtorName!))
    if (byName.length === 1) {
      return { status: 'suggested', invoiceId: byName[0]!.id, reason: 'fuzzy' }
    }
  }
  return { status: 'unmatched' }
}

/** Flip an invoice to paid, freezing the total and stamping the booking date. */
export function markInvoicePaid(
  db: Database,
  invoiceId: number,
  paidAt: string,
  totalRappen: number
): void {
  db.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, total_rappen = ? WHERE id = ?").run(
    paidAt,
    totalRappen,
    invoiceId
  )
}

/**
 * Import a parsed statement: validate the account, store each credit
 * (deduped), match the new ones, and auto-pay exact deterministic matches.
 * Everything runs in one transaction. Returns counts for the import summary.
 */
export function reconcileStatement(
  db: Database,
  statement: ParsedStatement,
  filename: string
): ImportSummary {
  const sender = db.prepare('SELECT iban, vat_registered FROM sender WHERE id = 1').get() as
    | { iban: string; vat_registered: number }
    | undefined
  if (!sender) throw new ReconcileError(400, 'Sender is not configured')

  const norm = (iban: string) => iban.replace(/\s/g, '').toUpperCase()
  if (norm(sender.iban) !== norm(statement.iban)) {
    throw new ReconcileError(
      422,
      `Statement is for account ${statement.iban}, but your account is ${sender.iban}`
    )
  }
  const vat = !!sender.vat_registered

  const summary: ImportSummary = {
    importId: 0,
    total: statement.credits.length,
    inserted: 0,
    duplicates: 0,
    autoMatched: 0,
    suggested: 0,
    unmatched: 0
  }

  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO bank_transactions
       (import_id, booking_date, value_date, amount_rappen, currency, reference,
        end_to_end_id, debtor_name, acct_svcr_ref, dedupe_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched')`
  )

  db.transaction(() => {
    const importRow = db
      .prepare(
        `INSERT INTO bank_imports (filename, iban, statement_id, from_date, to_date, tx_count)
         VALUES (?, ?, ?, ?, ?, 0)`
      )
      .run(filename, statement.iban, statement.statementId, statement.fromDate, statement.toDate)
    summary.importId = Number(importRow.lastInsertRowid)

    for (const credit of statement.credits) {
      const res = insertTx.run(
        summary.importId,
        credit.bookingDate,
        credit.valueDate,
        credit.amountRappen,
        credit.currency,
        credit.reference,
        credit.endToEndId,
        credit.debtorName,
        credit.acctSvcrRef,
        dedupeHash(credit)
      )
      // changes === 0 -> an identical transaction is already stored (statements
      // overlap at period boundaries). Don't re-match: it may already be
      // confirmed or ignored.
      if (res.changes === 0) {
        summary.duplicates++
        continue
      }
      summary.inserted++
      const txId = Number(res.lastInsertRowid)

      const outcome = decideMatch(db, credit, vat)
      if (outcome.status === 'matched') {
        markInvoicePaid(db, outcome.invoiceId, credit.bookingDate, credit.amountRappen)
        db.prepare(
          "UPDATE bank_transactions SET status = 'matched', invoice_id = ? WHERE id = ?"
        ).run(outcome.invoiceId, txId)
        summary.autoMatched++
      } else if (outcome.status === 'suggested') {
        db.prepare(
          "UPDATE bank_transactions SET status = 'suggested', invoice_id = ? WHERE id = ?"
        ).run(outcome.invoiceId, txId)
        summary.suggested++
      } else {
        summary.unmatched++
      }
    }

    db.prepare('UPDATE bank_imports SET tx_count = ? WHERE id = ?').run(
      summary.inserted,
      summary.importId
    )
  })()

  return summary
}

/**
 * Confirm a transaction against an invoice: mark that invoice paid (freezing
 * its live total, stamping the transaction's booking date) and link the
 * transaction to it. Used both to accept a suggestion and to resolve an
 * unmatched transaction the owner pairs by hand. invoiceId overrides whatever
 * the matcher had suggested.
 */
export function confirmTransaction(
  db: Database,
  txId: number,
  invoiceId: number
): { invoiceId: number } {
  const tx = db
    .prepare('SELECT id, status, booking_date FROM bank_transactions WHERE id = ?')
    .get(txId) as { id: number; status: string; booking_date: string } | undefined
  if (!tx) throw new ReconcileError(404, 'Transaction not found')
  if (tx.status === 'matched') throw new ReconcileError(409, 'Transaction is already matched')
  if (tx.status === 'ignored') throw new ReconcileError(409, 'Transaction is ignored')

  const inv = db.prepare('SELECT id, status FROM invoices WHERE id = ?').get(invoiceId) as
    | { id: number; status: string }
    | undefined
  if (!inv) throw new ReconcileError(404, 'Invoice not found')
  if (inv.status === 'paid') throw new ReconcileError(409, 'Invoice is already paid')

  const total = liveTotalRappen(db, invoiceId, senderVat(db))
  db.transaction(() => {
    markInvoicePaid(db, invoiceId, tx.booking_date, total)
    db.prepare("UPDATE bank_transactions SET status = 'matched', invoice_id = ? WHERE id = ?").run(
      invoiceId,
      txId
    )
  })()
  return { invoiceId }
}

/** Mark a transaction ignored (bank fee, non-invoice income, etc.). */
export function ignoreTransaction(db: Database, txId: number): void {
  const tx = db.prepare('SELECT id, status FROM bank_transactions WHERE id = ?').get(txId) as
    | { id: number; status: string }
    | undefined
  if (!tx) throw new ReconcileError(404, 'Transaction not found')
  // A matched transaction has already flipped an invoice to paid; ignoring it
  // would leave that invoice paid with no backing transaction. Out of scope
  // for v1 — surface it rather than silently desync.
  if (tx.status === 'matched') {
    throw new ReconcileError(409, 'Cannot ignore a matched transaction')
  }
  db.prepare("UPDATE bank_transactions SET status = 'ignored', invoice_id = NULL WHERE id = ?").run(
    txId
  )
}

/**
 * Delete an import and its transactions (FK cascade). Blocked while any of its
 * transactions are confirmed matches, since deleting would orphan invoices that
 * were marked paid off this statement.
 */
export function deleteImport(db: Database, importId: number): void {
  const imp = db.prepare('SELECT id FROM bank_imports WHERE id = ?').get(importId)
  if (!imp) throw new ReconcileError(404, 'Import not found')
  const { n } = db
    .prepare(
      "SELECT COUNT(*) AS n FROM bank_transactions WHERE import_id = ? AND status = 'matched'"
    )
    .get(importId) as { n: number }
  if (n > 0) {
    throw new ReconcileError(409, `Import has ${n} confirmed match(es); cannot delete`)
  }
  db.prepare('DELETE FROM bank_imports WHERE id = ?').run(importId)
}
