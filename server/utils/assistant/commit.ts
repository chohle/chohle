// Executes the writes the assistant PROPOSED, after the user approved them in
// the chat. This is the ONLY place the assistant writes, and it only ever
// CREATES or EDITS — there is deliberately no delete path, and an edit can only
// change fields, never remove a record. Everything is re-validated here; the
// proposal echoed back from the client is never trusted.
//
// Reuses the same parsers as the normal HTTP endpoints so assistant records are
// identical to hand-entered ones.
import type { Database } from 'better-sqlite3'
import { parseCustomer, customerValues, CUSTOMER_COLUMNS } from '../customer'
import { parseArticle } from '../article'
import { parseExpense } from '../expense'
import { parseIncomeSource } from '../incomeSource'
import { computeInvoiceTotals, normalizeArticleId } from '../../../shared/utils/invoice'

export type Raw = Record<string, unknown>

export interface ProposedLine {
  description: string
  quantity: number
  unitPriceChf: number
  unit?: string
  discountPercent?: number
  mwstPercent?: number
  articleId?: number | null
  articleName?: string // quotes only
}
export interface ProposedRef {
  label?: string
  url?: string
}

export type ProposedAction =
  // --- create ---
  | { type: 'create_customer'; customer: Raw }
  | {
      type: 'create_invoice'
      customerId?: number
      newCustomer?: Raw
      projectId?: number
      newProjectName?: string
      title?: string
      lines: ProposedLine[]
    }
  | {
      type: 'create_quote'
      customerId?: number
      newCustomer?: Raw
      projectId?: number
      title?: string
      validUntil?: string
      lines: ProposedLine[]
      references?: ProposedRef[]
    }
  | { type: 'create_article'; name: string; unit?: string; price: number; mwst?: number }
  | { type: 'create_signature'; name: string; contentHtml?: string; isDefault?: boolean }
  | {
      type: 'create_expense'
      title: string
      amount: number
      date: string
      categoryName?: string
      categoryId?: number
      vendor?: string
      notes?: string
    }
  | {
      type: 'create_income'
      company: string
      jobTitle?: string
      salary: number
      payoutDay: number
      canton: string
      payoutRule?: string
    }
  // --- edit (change fields of an existing record; never removes it) ---
  | { type: 'edit_customer'; id: number; changes: Raw }
  | {
      type: 'edit_invoice'
      id: number
      title?: string
      number?: string
      issueDate?: string
      dueDate?: string
      lines?: ProposedLine[]
    }
  | {
      type: 'edit_quote'
      id: number
      title?: string
      number?: string
      validUntil?: string
      lines?: ProposedLine[]
      references?: ProposedRef[]
    }
  | { type: 'edit_article'; id: number; changes: Raw }
  | { type: 'edit_signature'; id: number; name?: string; contentHtml?: string; isDefault?: boolean }

export type ProposalKind =
  | 'customer'
  | 'invoice'
  | 'quote'
  | 'article'
  | 'signature'
  | 'expense'
  | 'income'
  | 'project'

export interface CommitRef {
  kind: ProposalKind
  id: number
  label: string
}
export interface CommitResult {
  created: CommitRef[]
  updated: CommitRef[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Normalize a proposed line into the totals shape (Rappen) used everywhere.
function lineForTotals(l: ProposedLine) {
  return {
    quantity: Number(l?.quantity) || 0,
    unitPriceRappen: Math.round((Number(l?.unitPriceChf) || 0) * 100),
    discountPercent: Number(l?.discountPercent) || 0,
    mwstPercent: Number.isFinite(Number(l?.mwstPercent)) ? Number(l?.mwstPercent) : 8.1
  }
}

// Run every approved action in one transaction: any failure rolls the whole
// batch back. No async work inside the transaction (better-sqlite3).
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
    const result: CommitResult = { created: [], updated: [] }
    const created = (kind: ProposalKind, id: number, label: string) =>
      result.created.push({ kind, id, label })
    const updated = (kind: ProposalKind, id: number, label: string) =>
      result.updated.push({ kind, id, label })

    // --- shared helpers -----------------------------------------------------
    const insertCustomer = (raw: Raw): { id: number; name: string } => {
      const c = parseCustomer(raw)
      const placeholders = CUSTOMER_COLUMNS.map(() => '?').join(', ')
      const info = db
        .prepare(`INSERT INTO customers (${CUSTOMER_COLUMNS.join(', ')}) VALUES (${placeholders})`)
        .run(...customerValues(c))
      const id = Number(info.lastInsertRowid)
      created('customer', id, c.name)
      return { id, name: c.name }
    }

    const resolveCustomerId = (a: { customerId?: number; newCustomer?: Raw }): number => {
      if (a.newCustomer) return insertCustomer(a.newCustomer).id
      const id = Number(a.customerId)
      if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)
      ) {
        throw createError({ statusCode: 400, statusMessage: 'Unknown customer' })
      }
      return id
    }

    const insertInvoiceItems = (invoiceId: number, lines: ProposedLine[]) => {
      const stmt = db.prepare(
        `INSERT INTO invoice_items
           (invoice_id, article_id, description, quantity, unit, unit_price_rappen,
            discount_percent, mwst_percent, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const totals = lines.map((l, i) => {
        const t = lineForTotals(l)
        stmt.run(
          invoiceId,
          normalizeArticleId(l?.articleId),
          String(l?.description ?? ''),
          t.quantity,
          String(l?.unit ?? ''),
          t.unitPriceRappen,
          t.discountPercent,
          t.mwstPercent,
          i
        )
        return t
      })
      return computeInvoiceTotals(totals, vat).totalRappen
    }

    const insertQuoteItems = (quoteId: number, lines: ProposedLine[]) => {
      const stmt = db.prepare(
        `INSERT INTO quote_items
           (quote_id, article_id, article_name, description, quantity, unit, unit_price_rappen,
            discount_percent, mwst_percent, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const totals = lines.map((l, i) => {
        const t = lineForTotals(l)
        stmt.run(
          quoteId,
          normalizeArticleId(l?.articleId),
          String(l?.articleName ?? ''),
          String(l?.description ?? ''),
          t.quantity,
          String(l?.unit ?? ''),
          t.unitPriceRappen,
          t.discountPercent,
          t.mwstPercent,
          i
        )
        return t
      })
      return computeInvoiceTotals(totals, vat).totalRappen
    }

    const insertQuoteRefs = (quoteId: number, refs: ProposedRef[] | undefined) => {
      const stmt = db.prepare(
        'INSERT INTO quote_references (quote_id, label, url, sort_order) VALUES (?, ?, ?, ?)'
      )
      ;(refs ?? []).forEach((r, i) => {
        const label = String(r?.label ?? '').trim()
        const url = String(r?.url ?? '').trim()
        if (label || url) stmt.run(quoteId, label, url, i)
      })
    }

    const setSignatureDefault = () => db.prepare('UPDATE signatures SET is_default = 0').run()

    // --- per-action -----------------------------------------------------------
    for (const action of actions) {
      if (!action || typeof action !== 'object') {
        throw createError({ statusCode: 400, statusMessage: 'Malformed action' })
      }

      switch (action.type) {
        case 'create_customer': {
          insertCustomer(action.customer ?? {})
          break
        }

        case 'create_invoice': {
          const customerId = resolveCustomerId(action)
          // Resolve project (invoices require one) or auto-create a sales project.
          let projectId: number
          if (action.projectId) {
            const p = db
              .prepare('SELECT id, customer_id FROM projects WHERE id = ?')
              .get(action.projectId) as { id: number; customer_id: number | null } | undefined
            if (!p) throw createError({ statusCode: 400, statusMessage: 'Unknown project' })
            if (p.customer_id && p.customer_id !== customerId) {
              throw createError({ statusCode: 400, statusMessage: 'Project is another customer’s' })
            }
            projectId = p.id
          } else {
            const name = (action.newProjectName || action.title || 'Assistant project').slice(
              0,
              200
            )
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
            created('project', projectId, name)
          }
          const term = (
            db.prepare('SELECT payment_term_days FROM customers WHERE id = ?').get(customerId) as {
              payment_term_days: number
            }
          ).payment_term_days
          const due = new Date(Date.now() + term * 86_400_000).toISOString().slice(0, 10)
          const title = (action.title || '').slice(0, 200)
          const id = Number(
            db
              .prepare(
                `INSERT INTO invoices (customer_id, project_id, number, title, issue_date, due_date)
                 VALUES (?, ?, '', ?, ?, ?)`
              )
              .run(customerId, projectId, title, todayIso(), due).lastInsertRowid
          )
          const lines = Array.isArray(action.lines) ? action.lines : []
          if (lines.length === 0) {
            throw createError({ statusCode: 400, statusMessage: 'Invoice has no line items' })
          }
          insertInvoiceItems(id, lines)
          created('invoice', id, `#${id}`)
          break
        }

        case 'create_quote': {
          const customerId = resolveCustomerId(action)
          let projectId: number | null = null
          if (action.projectId) {
            const p = db
              .prepare('SELECT id, customer_id FROM projects WHERE id = ?')
              .get(action.projectId) as { id: number; customer_id: number | null } | undefined
            if (!p) throw createError({ statusCode: 400, statusMessage: 'Unknown project' })
            if (p.customer_id && p.customer_id !== customerId) {
              throw createError({ statusCode: 400, statusMessage: 'Project is another customer’s' })
            }
            projectId = p.id
          }
          const validUntil =
            action.validUntil && DATE_RE.test(action.validUntil)
              ? action.validUntil
              : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
          const title = (action.title || '').slice(0, 200)
          const lines = Array.isArray(action.lines) ? action.lines : []
          if (lines.length === 0) {
            throw createError({ statusCode: 400, statusMessage: 'Quote has no line items' })
          }
          const id = Number(
            db
              .prepare(
                `INSERT INTO quotes (customer_id, project_id, number, title, issue_date, valid_until)
                 VALUES (?, ?, '', ?, ?, ?)`
              )
              .run(customerId, projectId, title, todayIso(), validUntil).lastInsertRowid
          )
          const total = insertQuoteItems(id, lines)
          insertQuoteRefs(id, action.references)
          db.prepare('UPDATE quotes SET total_rappen = ? WHERE id = ?').run(total, id)
          created('quote', id, title || `#${id}`)
          break
        }

        case 'create_article': {
          const a = parseArticle({
            name: action.name,
            unit: action.unit,
            price: action.price,
            mwst: action.mwst ?? 8.1
          })
          const id = Number(
            db
              .prepare(
                'INSERT INTO articles (name, unit, default_price_rappen, default_mwst) VALUES (?, ?, ?, ?)'
              )
              .run(a.name, a.unit, a.priceRappen, a.mwst).lastInsertRowid
          )
          created('article', id, a.name)
          break
        }

        case 'create_signature': {
          const name = String(action.name ?? '').trim()
          if (!name)
            throw createError({ statusCode: 400, statusMessage: 'Signature name required' })
          const count = (db.prepare('SELECT COUNT(*) AS n FROM signatures').get() as { n: number })
            .n
          const makeDefault = action.isDefault === true || count === 0
          if (makeDefault) setSignatureDefault()
          const id = Number(
            db
              .prepare('INSERT INTO signatures (name, content_html, is_default) VALUES (?, ?, ?)')
              .run(name, String(action.contentHtml ?? ''), makeDefault ? 1 : 0).lastInsertRowid
          )
          created('signature', id, name)
          break
        }

        case 'create_expense': {
          let categoryId: number | null = null
          if (action.categoryId) categoryId = Number(action.categoryId)
          else if (action.categoryName) {
            const row = db
              .prepare(
                "SELECT id FROM categories WHERE type = 'expense' AND name = ? COLLATE NOCASE"
              )
              .get(String(action.categoryName).trim()) as { id: number } | undefined
            categoryId = row?.id ?? null
          }
          const e = parseExpense({
            title: action.title,
            amount: action.amount,
            date: action.date,
            categoryId,
            vendor: action.vendor,
            notes: action.notes
          })
          const id = Number(
            db
              .prepare(
                `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              )
              .run(e.title, e.amountRappen, e.currency, e.date, e.categoryId, e.vendor, e.notes)
              .lastInsertRowid
          )
          created('expense', id, e.title)
          break
        }

        case 'create_income': {
          const s = parseIncomeSource({
            company: action.company,
            jobTitle: action.jobTitle,
            salary: action.salary,
            payoutDay: action.payoutDay,
            canton: action.canton,
            payoutRule: action.payoutRule ?? 'earlier'
          })
          const id = Number(
            db
              .prepare(
                `INSERT INTO income_sources (company, job_title, salary_rappen, currency, payout_day, canton, payout_rule)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              )
              .run(
                s.company,
                s.jobTitle,
                s.salaryRappen,
                s.currency,
                s.payoutDay,
                s.canton,
                s.payoutRule
              ).lastInsertRowid
          )
          created('income', id, s.company)
          break
        }

        case 'edit_customer': {
          const id = Number(action.id)
          const current = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
            | Record<string, unknown>
            | undefined
          if (!current) throw createError({ statusCode: 400, statusMessage: 'Unknown customer' })
          // Merge changes onto the current row (camelCase keys expected), then
          // re-validate through parseCustomer so the result is always valid.
          const merged = mergeCustomer(current, action.changes ?? {})
          const c = parseCustomer(merged)
          const setSql = CUSTOMER_COLUMNS.map((col) => `${col} = ?`).join(', ')
          db.prepare(`UPDATE customers SET ${setSql} WHERE id = ?`).run(...customerValues(c), id)
          updated('customer', id, c.name)
          break
        }

        case 'edit_article': {
          const id = Number(action.id)
          const cur = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as
            | { name: string; unit: string; default_price_rappen: number; default_mwst: number }
            | undefined
          if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown article' })
          const ch = (action.changes ?? {}) as Raw
          const a = parseArticle({
            name: ch.name ?? cur.name,
            unit: ch.unit ?? cur.unit,
            price: ch.price ?? cur.default_price_rappen / 100,
            mwst: ch.mwst ?? cur.default_mwst
          })
          db.prepare(
            'UPDATE articles SET name = ?, unit = ?, default_price_rappen = ?, default_mwst = ? WHERE id = ?'
          ).run(a.name, a.unit, a.priceRappen, a.mwst, id)
          updated('article', id, a.name)
          break
        }

        case 'edit_signature': {
          const id = Number(action.id)
          const cur = db
            .prepare('SELECT name, content_html, is_default FROM signatures WHERE id = ?')
            .get(id) as { name: string; content_html: string; is_default: number } | undefined
          if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown signature' })
          const name = action.name !== undefined ? String(action.name).trim() : cur.name
          if (!name)
            throw createError({ statusCode: 400, statusMessage: 'Signature name required' })
          const contentHtml =
            action.contentHtml !== undefined ? String(action.contentHtml) : cur.content_html
          const makeDefault = action.isDefault === true || cur.is_default === 1
          if (action.isDefault === true) setSignatureDefault()
          db.prepare(
            'UPDATE signatures SET name = ?, content_html = ?, is_default = ? WHERE id = ?'
          ).run(name, contentHtml, makeDefault ? 1 : 0, id)
          updated('signature', id, name)
          break
        }

        case 'edit_invoice': {
          const id = Number(action.id)
          const cur = db
            .prepare(
              'SELECT number, title, status, issue_date, due_date FROM invoices WHERE id = ?'
            )
            .get(id) as
            | {
                number: string
                title: string
                status: string
                issue_date: string
                due_date: string
              }
            | undefined
          if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown invoice' })
          const number = action.number !== undefined ? String(action.number).trim() : cur.number
          const title = action.title !== undefined ? String(action.title).slice(0, 200) : cur.title
          const issueDate =
            action.issueDate && DATE_RE.test(action.issueDate) ? action.issueDate : cur.issue_date
          const dueDate =
            action.dueDate && DATE_RE.test(action.dueDate) ? action.dueDate : cur.due_date
          let totalSnapshot: number | null = null
          if (Array.isArray(action.lines)) {
            db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
            const total = insertInvoiceItems(id, action.lines)
            totalSnapshot = cur.status === 'paid' ? total : null
          } else {
            totalSnapshot = (
              db.prepare('SELECT total_rappen FROM invoices WHERE id = ?').get(id) as {
                total_rappen: number | null
              }
            ).total_rappen
          }
          db.prepare(
            'UPDATE invoices SET number = ?, title = ?, issue_date = ?, due_date = ?, total_rappen = ? WHERE id = ?'
          ).run(number, title, issueDate, dueDate, totalSnapshot, id)
          updated('invoice', id, number || `#${id}`)
          break
        }

        case 'edit_quote': {
          const id = Number(action.id)
          const cur = db
            .prepare('SELECT number, title, valid_until FROM quotes WHERE id = ?')
            .get(id) as { number: string; title: string; valid_until: string | null } | undefined
          if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown quote' })
          const number = action.number !== undefined ? String(action.number).trim() : cur.number
          const title = action.title !== undefined ? String(action.title).slice(0, 200) : cur.title
          const validUntil =
            action.validUntil && DATE_RE.test(action.validUntil)
              ? action.validUntil
              : cur.valid_until
          if (Array.isArray(action.lines)) {
            db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id)
            const total = insertQuoteItems(id, action.lines)
            db.prepare('UPDATE quotes SET total_rappen = ? WHERE id = ?').run(total, id)
          }
          if (Array.isArray(action.references)) {
            db.prepare('DELETE FROM quote_references WHERE quote_id = ?').run(id)
            insertQuoteRefs(id, action.references)
          }
          db.prepare('UPDATE quotes SET number = ?, title = ?, valid_until = ? WHERE id = ?').run(
            number,
            title,
            validUntil,
            id
          )
          updated('quote', id, title || number || `#${id}`)
          break
        }

        default:
          throw createError({ statusCode: 400, statusMessage: 'Unknown action type' })
      }
    }

    return result
  })

  return run()
}

// Map a current customers row (snake_case) onto the camelCase keys parseCustomer
// expects, then overlay the proposed changes (camelCase). Lets an edit specify
// only the fields it wants to change while the rest stay as they are.
function mergeCustomer(row: Record<string, unknown>, changes: Raw): Raw {
  const base: Raw = {
    type: row.type,
    name: row.name,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    street: row.street,
    zip: row.zip,
    city: row.city,
    country: row.country,
    language: row.language,
    customerNumber: row.customer_number,
    priceCategory: row.price_category,
    discountPercent: row.discount_percent,
    paymentTermDays: row.payment_term_days,
    website: row.website,
    foundingYear: row.founding_year,
    social: row.social,
    uid: row.uid,
    mwst: row.mwst,
    hrNumber: row.hr_number
  }
  return { ...base, ...changes }
}
