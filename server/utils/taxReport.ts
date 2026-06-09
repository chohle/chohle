// Gathers everything a Swiss tax year needs into one structured object: the
// Erfolgsrechnung (income vs expenses), an expense journal, the VAT (MWST)
// summary, and which expenses are missing a receipt. Pure (db + year in, object
// out) so it can be unit-tested and reused by the PDF, CSV and JSON-preview.
//
// Cash basis: invoices by paid_at, salary by income_payments.month, expenses by
// date. All amounts in Rappen.
import type { Database } from 'better-sqlite3'
import { computeInvoiceTotals, round5 } from '../../shared/utils/invoice'

export interface TaxReportAttachment {
  id: number
  filename: string
  storedName: string
}
export interface TaxJournalRow {
  id: number
  date: string
  vendor: string
  title: string
  category: string
  grossRappen: number
  vatRate: number
  inputVatRappen: number
  attachments: TaxReportAttachment[]
}
export interface TaxReport {
  year: number
  sender: {
    name: string
    street: string
    zip: string
    city: string
    country: string
    mwst: string
    uid: string
    vatRegistered: boolean
  }
  income: {
    invoiceRappen: number
    salaryRappen: number
    totalRappen: number
    invoices: { number: string; paidAt: string; customer: string; totalRappen: number }[]
    salary: { month: string; company: string; amountRappen: number }[]
  }
  expenses: {
    totalRappen: number
    byCategory: { name: string; totalRappen: number }[]
    journal: TaxJournalRow[]
  }
  netRappen: number
  vat: {
    registered: boolean
    outputByRate: { rate: number; vatRappen: number }[]
    outputRappen: number
    inputRappen: number
    netVatRappen: number
  }
  missingReceipts: {
    id: number
    date: string
    vendor: string
    title: string
    grossRappen: number
  }[]
}

/** Input VAT (Vorsteuer) contained in a gross amount at the given rate.
 *  Rounded to 5 Rappen, consistent with the rest of the CHF money math. */
function inputVat(grossRappen: number, rate: number): number {
  return rate > 0 ? round5((grossRappen * rate) / (100 + rate)) : 0
}

/** Build the full tax-year report object for a 4-digit year. */
export function buildTaxReport(db: Database, year: number): TaxReport {
  const y = String(year)

  const s = db.prepare('SELECT * FROM sender WHERE id = 1').get() as
    | Record<string, unknown>
    | undefined
  const sender = {
    name: String(s?.name ?? ''),
    street: String(s?.street ?? ''),
    zip: String(s?.zip ?? ''),
    city: String(s?.city ?? ''),
    country: String(s?.country ?? 'CH'),
    mwst: String(s?.mwst ?? ''),
    uid: String(s?.uid ?? ''),
    vatRegistered: !!s?.vat_registered
  }

  // --- income ---
  const invoices = db
    .prepare(
      `SELECT i.number AS number, i.paid_at AS paidAt, i.total_rappen AS totalRappen, c.name AS customer
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status = 'paid' AND substr(i.paid_at, 1, 4) = ?
       ORDER BY i.paid_at, i.id`
    )
    .all(y) as { number: string; paidAt: string; totalRappen: number; customer: string }[]
  const invoiceRappen = invoices.reduce((n, r) => n + (r.totalRappen || 0), 0)

  const salary = db
    .prepare(
      `SELECT ip.month AS month, ip.amount_rappen AS amountRappen, src.company AS company
       FROM income_payments ip JOIN income_sources src ON src.id = ip.source_id
       WHERE substr(ip.month, 1, 4) = ?
       ORDER BY ip.month`
    )
    .all(y) as { month: string; amountRappen: number; company: string }[]
  const salaryRappen = salary.reduce((n, r) => n + (r.amountRappen || 0), 0)

  // --- expenses + receipts ---
  const expenseRows = db
    .prepare(
      `SELECT e.id AS id, e.date AS date, e.vendor AS vendor, e.title AS title,
              e.amount_rappen AS grossRappen, e.vat_rate AS vatRate, c.name AS category
       FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
       WHERE substr(e.date, 1, 4) = ?
       ORDER BY e.date, e.id`
    )
    .all(y) as {
    id: number
    date: string
    vendor: string | null
    title: string
    grossRappen: number
    vatRate: number
    category: string | null
  }[]

  const attRows = db
    .prepare(
      `SELECT a.id AS id, a.expense_id AS expenseId, a.filename AS filename, a.stored_name AS storedName
       FROM attachments a JOIN expenses e ON e.id = a.expense_id
       WHERE substr(e.date, 1, 4) = ?`
    )
    .all(y) as { id: number; expenseId: number; filename: string; storedName: string }[]
  const attByExpense = new Map<number, TaxReportAttachment[]>()
  for (const a of attRows) {
    const list = attByExpense.get(a.expenseId) ?? []
    list.push({ id: a.id, filename: a.filename, storedName: a.storedName })
    attByExpense.set(a.expenseId, list)
  }

  const journal: TaxJournalRow[] = expenseRows.map((e) => ({
    id: e.id,
    date: e.date,
    vendor: e.vendor ?? '',
    title: e.title,
    category: e.category ?? '',
    grossRappen: e.grossRappen,
    vatRate: e.vatRate ?? 0,
    inputVatRappen: inputVat(e.grossRappen, e.vatRate ?? 0),
    attachments: attByExpense.get(e.id) ?? []
  }))
  const expenseTotal = journal.reduce((n, r) => n + r.grossRappen, 0)

  const byCategoryMap = new Map<string, number>()
  for (const e of journal) {
    const key = e.category || 'Uncategorized'
    byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + e.grossRappen)
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([name, totalRappen]) => ({ name, totalRappen }))
    .sort((a, b) => b.totalRappen - a.totalRappen)

  // --- VAT (only meaningful when registered) ---
  const outputRateMap = new Map<number, number>()
  if (sender.vatRegistered) {
    const ids = db
      .prepare(`SELECT id FROM invoices WHERE status = 'paid' AND substr(paid_at, 1, 4) = ?`)
      .all(y) as { id: number }[]
    const itemStmt = db.prepare(
      'SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?'
    )
    for (const { id } of ids) {
      const items = itemStmt.all(id) as {
        quantity: number
        unit_price_rappen: number
        discount_percent: number
        mwst_percent: number
      }[]
      const totals = computeInvoiceTotals(
        items.map((it) => ({
          quantity: it.quantity,
          unitPriceRappen: it.unit_price_rappen,
          discountPercent: it.discount_percent,
          mwstPercent: it.mwst_percent
        })),
        true
      )
      for (const r of totals.mwstByRate) {
        outputRateMap.set(r.rate, (outputRateMap.get(r.rate) ?? 0) + r.mwstRappen)
      }
    }
  }
  const outputByRate = [...outputRateMap.entries()]
    .map(([rate, vatRappen]) => ({ rate, vatRappen }))
    .sort((a, b) => a.rate - b.rate)
  const outputRappen = outputByRate.reduce((n, r) => n + r.vatRappen, 0)
  const inputRappen = journal.reduce((n, r) => n + r.inputVatRappen, 0)

  const missingReceipts = journal
    .filter((r) => r.attachments.length === 0)
    .map((r) => ({
      id: r.id,
      date: r.date,
      vendor: r.vendor,
      title: r.title,
      grossRappen: r.grossRappen
    }))

  return {
    year,
    sender,
    income: {
      invoiceRappen,
      salaryRappen,
      totalRappen: invoiceRappen + salaryRappen,
      invoices,
      salary
    },
    expenses: { totalRappen: expenseTotal, byCategory, journal },
    netRappen: invoiceRappen + salaryRappen - expenseTotal,
    vat: {
      registered: sender.vatRegistered,
      outputByRate,
      outputRappen,
      inputRappen,
      netVatRappen: outputRappen - inputRappen
    },
    missingReceipts
  }
}

/** Years (descending) that have any expense or paid invoice, for the UI picker. */
export function taxReportYears(db: Database): number[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT y FROM (
         SELECT substr(date, 1, 4) AS y FROM expenses
         UNION SELECT substr(paid_at, 1, 4) FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL
         UNION SELECT substr(month, 1, 4) FROM income_payments
       ) WHERE y IS NOT NULL AND y != '' ORDER BY y DESC`
    )
    .all() as { y: string }[]
  return rows.map((r) => Number(r.y)).filter((n) => Number.isInteger(n))
}
