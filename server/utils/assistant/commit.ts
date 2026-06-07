// Executes the writes the assistant PROPOSED, after the user approved them in
// the chat. This is the ONLY place the assistant ever writes, and it only ever
// CREATES (customers, projects, invoices, line items) — there is deliberately
// no update/delete path. Everything is re-validated here; the proposal echoed
// back from the client is never trusted.
//
// Reuses the same building blocks as the normal HTTP endpoints so the data is
// identical to a hand-entered record:
//   - parseCustomer / customerValues / CUSTOMER_COLUMNS (server/utils/customer.ts)
//   - computeInvoiceTotals / normalizeArticleId (shared/utils/invoice.ts)
//   - sender.vat_registered for the VAT decision
import type { Database } from 'better-sqlite3'
import { parseCustomer, customerValues, CUSTOMER_COLUMNS } from '../customer'
import { computeInvoiceTotals, normalizeArticleId } from '../../../shared/utils/invoice'

// A raw customer object, validated through parseCustomer on commit.
export type ProposedCustomer = Record<string, unknown>

export interface ProposedInvoiceLine {
  description: string
  quantity: number
  // Price per unit in CHF in the proposal; converted to Rappen server-side.
  unitPriceChf: number
  unit?: string
  discountPercent?: number
  mwstPercent?: number
  articleId?: number | null
}

export type ProposedAction =
  | { type: 'create_customer'; customer: ProposedCustomer }
  | {
      type: 'create_invoice'
      // Customer: an existing id (from find_customer) OR a new-customer object.
      customerId?: number
      newCustomer?: ProposedCustomer
      // Project: an existing id OR auto-create one by name. Invoices require a
      // project (invoices.project_id is NOT NULL), so one of these must resolve.
      projectId?: number
      newProjectName?: string
      title?: string
      lines: ProposedInvoiceLine[]
    }

export interface CommitResult {
  customers: { id: number; name: string }[]
  projects: { id: number; name: string }[]
  invoices: { id: number; title: string; totalRappen: number }[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Run every approved action in a single transaction: any failure rolls the
// whole batch back, so you never get a customer without its invoice or an
// orphan project. No async work inside the transaction (better-sqlite3).
// Takes the db handle explicitly so it stays unit-testable with an in-memory db.
export function commitActions(db: Database, actions: ProposedAction[]): CommitResult {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No actions to commit' })
  }
  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered

  const run = db.transaction((): CommitResult => {
    const result: CommitResult = { customers: [], projects: [], invoices: [] }

    const insertCustomer = (raw: ProposedCustomer): number => {
      const c = parseCustomer(raw) // re-validates (name required, numeric coercion, …)
      const placeholders = CUSTOMER_COLUMNS.map(() => '?').join(', ')
      const info = db
        .prepare(`INSERT INTO customers (${CUSTOMER_COLUMNS.join(', ')}) VALUES (${placeholders})`)
        .run(...customerValues(c))
      const id = Number(info.lastInsertRowid)
      result.customers.push({ id, name: c.name })
      return id
    }

    for (const action of actions) {
      if (!action || typeof action !== 'object') {
        throw createError({ statusCode: 400, statusMessage: 'Malformed action' })
      }

      if (action.type === 'create_customer') {
        insertCustomer(action.customer ?? {})
        continue
      }

      if (action.type !== 'create_invoice') {
        throw createError({ statusCode: 400, statusMessage: `Unknown action type` })
      }

      // --- resolve customer (new object xor existing id) ---
      let customerId: number
      if (action.newCustomer) {
        customerId = insertCustomer(action.newCustomer)
      } else {
        customerId = Number(action.customerId)
        if (
          !Number.isInteger(customerId) ||
          customerId <= 0 ||
          !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)
        ) {
          throw createError({ statusCode: 400, statusMessage: 'Unknown customer' })
        }
      }

      // --- resolve project (existing id xor auto-create by name) ---
      let projectId: number
      if (action.projectId) {
        const p = db
          .prepare('SELECT id, customer_id FROM projects WHERE id = ?')
          .get(action.projectId) as { id: number; customer_id: number | null } | undefined
        if (!p) throw createError({ statusCode: 400, statusMessage: 'Unknown project' })
        if (p.customer_id && p.customer_id !== customerId) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Project belongs to another customer'
          })
        }
        projectId = p.id
      } else {
        const name = (action.newProjectName || action.title || 'Assistant project').slice(0, 200)
        const pos = (
          db
            .prepare(
              `SELECT COALESCE(MAX(position), -1) + 1 AS p
               FROM projects WHERE direction = 'sales' AND stage = 'active'`
            )
            .get() as { p: number }
        ).p
        const info = db
          .prepare(
            `INSERT INTO projects (name, customer_id, direction, stage, label, budget_rappen,
                                   budget_type, position)
             VALUES (?, ?, 'sales', 'active', 'Created by assistant', 0, 'fixed', ?)`
          )
          .run(name, customerId, pos)
        projectId = Number(info.lastInsertRowid)
        result.projects.push({ id: projectId, name })
      }

      // --- due date from the customer's payment term ---
      const term = (
        db.prepare('SELECT payment_term_days FROM customers WHERE id = ?').get(customerId) as {
          payment_term_days: number
        }
      ).payment_term_days
      const due = new Date(Date.now() + term * 86_400_000).toISOString().slice(0, 10)

      // --- invoice (blank number = draft, assigned later in the UI) ---
      const title = (action.title || '').slice(0, 200)
      const invInfo = db
        .prepare(
          `INSERT INTO invoices (customer_id, project_id, number, title, issue_date, due_date)
           VALUES (?, ?, '', ?, ?, ?)`
        )
        .run(customerId, projectId, title, todayIso(), due)
      const invoiceId = Number(invInfo.lastInsertRowid)

      // --- line items (CHF -> Rappen, position = index) ---
      const insertItem = db.prepare(
        `INSERT INTO invoice_items
           (invoice_id, article_id, description, quantity, unit, unit_price_rappen,
            discount_percent, mwst_percent, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const lines = Array.isArray(action.lines) ? action.lines : []
      if (lines.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'Invoice has no line items' })
      }
      const totalsLines = lines.map((l, i) => {
        const unitPriceRappen = Math.round((Number(l?.unitPriceChf) || 0) * 100)
        const mwstPercent = Number.isFinite(Number(l?.mwstPercent)) ? Number(l?.mwstPercent) : 8.1
        const quantity = Number(l?.quantity) || 0
        const discountPercent = Number(l?.discountPercent) || 0
        insertItem.run(
          invoiceId,
          normalizeArticleId(l?.articleId),
          String(l?.description ?? ''),
          quantity,
          String(l?.unit ?? ''),
          unitPriceRappen,
          discountPercent,
          mwstPercent,
          i
        )
        return { quantity, unitPriceRappen, discountPercent, mwstPercent }
      })

      const { totalRappen } = computeInvoiceTotals(totalsLines, vat)
      result.invoices.push({ id: invoiceId, title, totalRappen })
    }

    return result
  })

  return run()
}
