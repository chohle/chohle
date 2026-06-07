// The assistant's tool registry. Two kinds:
//   - READ tools execute immediately against the db and feed results back.
//   - PROPOSE tools NEVER write. They validate, build a preview (for edits a
//     before -> after), and stop the loop so the user can approve.
// There is no delete tool and no send tool, so the assistant can neither destroy
// data nor email customers on its own — by construction.
import { computeInvoiceTotals } from '../../../shared/utils/invoice'
import type { ProposedAction, ProposalKind, ProposedLine } from './commit'

export interface OpenAITool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

// A pending write surfaced to the UI as an approval card.
export interface Proposal {
  kind: ProposalKind
  mode: 'create' | 'edit'
  summary: string[] // the proposed (after) state
  before?: string[] // edits only: the current state
  action: ProposedAction
}

function chf(rappen: number): string {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function senderVat(): boolean {
  return !!(
    useDb().prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered
}
function parseLines(raw: unknown): ProposedLine[] {
  const arr = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
  return arr.map((l) => ({
    description: String(l?.description ?? '').trim(),
    quantity: Number(l?.quantity) || 0,
    unitPriceChf: Number(l?.unitPriceChf) || 0,
    unit: String(l?.unit ?? '').trim() || undefined,
    discountPercent: Number(l?.discountPercent) || 0,
    mwstPercent: Number.isFinite(Number(l?.mwstPercent)) ? Number(l?.mwstPercent) : 8.1,
    articleId: Number.isInteger(Number(l?.articleId)) ? Number(l?.articleId) : null,
    articleName: String(l?.articleName ?? '').trim() || undefined
  }))
}
function linesTotalRappen(lines: ProposedLine[]): number {
  return computeInvoiceTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceRappen: Math.round(l.unitPriceChf * 100),
      discountPercent: l.discountPercent ?? 0,
      mwstPercent: l.mwstPercent ?? 8.1
    })),
    senderVat()
  ).totalRappen
}
function lineSummary(count: number, totalRappen: number): string[] {
  return [`${count} ${count === 1 ? 'line' : 'lines'}`, `CHF ${chf(totalRappen)}`]
}

// A reusable line-items schema for invoice/quote tools.
const LINES_SCHEMA = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    required: ['description', 'quantity', 'unitPriceChf'],
    properties: {
      description: { type: 'string' },
      quantity: { type: 'number' },
      unitPriceChf: { type: 'number', description: 'price per unit in CHF' },
      unit: { type: 'string', description: "e.g. 'h', 'Stk', 'Pauschal'" },
      discountPercent: { type: 'number', default: 0 },
      mwstPercent: { type: 'number', default: 8.1 },
      articleId: { type: 'integer', description: 'optional saved article id' }
    }
  }
}

// ---------------------------------------------------------------------------
// Tool definitions.
// ---------------------------------------------------------------------------

export const READ_TOOLS: OpenAITool[] = [
  fn('list_customers', 'List customers, optionally filtered by a name substring.', {
    search: { type: 'string' },
    limit: { type: 'integer', default: 20 }
  }),
  fn(
    'find_customer',
    'Resolve a customer name/number to an id. Call before invoicing an existing customer.',
    { query: { type: 'string' } },
    ['query']
  ),
  fn('list_invoices', 'List recent invoices (filter by customerId or status).', {
    customerId: { type: 'integer' },
    status: { type: 'string', enum: ['draft', 'sent', 'paid'] },
    limit: { type: 'integer', default: 20 }
  }),
  fn(
    'get_invoice',
    'Full detail of one invoice incl. its line items. Call before editing an invoice.',
    { id: { type: 'integer' } },
    ['id']
  ),
  fn('list_quotes', 'List recent quotes (filter by customerId or status).', {
    customerId: { type: 'integer' },
    status: { type: 'string', enum: ['draft', 'sent', 'accepted', 'declined'] },
    limit: { type: 'integer', default: 20 }
  }),
  fn(
    'get_quote',
    'Full detail of one quote incl. line items + references. Call before editing a quote.',
    { id: { type: 'integer' } },
    ['id']
  ),
  fn('list_articles', 'List saved articles (catalog) with default price + VAT.', {
    search: { type: 'string' },
    customerId: { type: 'integer' }
  }),
  fn('list_signatures', 'List email signatures.', {}),
  fn('list_expenses', 'List recent expenses.', { limit: { type: 'integer', default: 20 } }),
  fn('list_categories', 'List expense/income categories (to map a name to an id).', {
    type: { type: 'string', enum: ['expense', 'income'] }
  }),
  fn('get_overview', 'A small summary: counts and the VAT-registered flag.', {})
]

export const PROPOSE_TOOLS: OpenAITool[] = [
  fn(
    'propose_customer',
    'Propose creating a customer (user must approve). Only "name" is required.',
    {
      type: { type: 'string', enum: ['person', 'company'], default: 'company' },
      name: { type: 'string' },
      contactPerson: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      street: { type: 'string' },
      zip: { type: 'string' },
      city: { type: 'string' },
      country: { type: 'string', default: 'CH' },
      language: { type: 'string', enum: ['de', 'fr', 'it', 'en'], default: 'de' },
      paymentTermDays: { type: 'integer', default: 30 },
      discountPercent: { type: 'number', default: 0 }
    },
    ['name']
  ),
  fn(
    'propose_invoice',
    'Propose a draft invoice (user must approve). Reference customerId (use find_customer) or newCustomer. Prices in CHF.',
    {
      customerId: { type: 'integer' },
      newCustomer: { type: 'object', properties: { name: { type: 'string' } } },
      projectId: { type: 'integer' },
      newProjectName: { type: 'string' },
      title: { type: 'string' },
      lines: LINES_SCHEMA
    },
    ['lines']
  ),
  fn(
    'propose_quote',
    'Propose a draft quote/offer (user must approve). Like an invoice; project is optional. Prices in CHF.',
    {
      customerId: { type: 'integer' },
      newCustomer: { type: 'object', properties: { name: { type: 'string' } } },
      projectId: { type: 'integer' },
      title: { type: 'string' },
      validUntil: { type: 'string', description: 'YYYY-MM-DD; defaults to 30 days out' },
      lines: LINES_SCHEMA,
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, url: { type: 'string' } }
        }
      }
    },
    ['lines']
  ),
  fn(
    'propose_article',
    'Propose a catalog article (user must approve). price in CHF.',
    {
      name: { type: 'string' },
      unit: { type: 'string' },
      price: { type: 'number' },
      mwst: { type: 'number', default: 8.1 }
    },
    ['name', 'price']
  ),
  fn(
    'propose_signature',
    'Propose an email signature (user must approve). contentHtml is the signature body.',
    {
      name: { type: 'string' },
      contentHtml: { type: 'string' },
      isDefault: { type: 'boolean' }
    },
    ['name']
  ),
  fn(
    'propose_expense',
    'Propose logging an expense (user must approve). amount in CHF, date YYYY-MM-DD. Use categoryName to tag it.',
    {
      title: { type: 'string' },
      amount: { type: 'number' },
      date: { type: 'string' },
      categoryName: { type: 'string' },
      vendor: { type: 'string' },
      notes: { type: 'string' }
    },
    ['title', 'amount', 'date']
  ),
  fn(
    'propose_income',
    'Propose an income/salary source (user must approve). salary in CHF, canton is a 2-letter Swiss canton.',
    {
      company: { type: 'string' },
      jobTitle: { type: 'string' },
      salary: { type: 'number' },
      payoutDay: { type: 'integer', description: 'day of month 1-31' },
      canton: { type: 'string' },
      payoutRule: { type: 'string', enum: ['earlier', 'later', 'none'], default: 'earlier' }
    },
    ['company', 'salary', 'payoutDay', 'canton']
  ),
  // --- edits (user must approve; show before -> after) ---
  fn(
    'propose_edit_customer',
    'Propose changing fields on an existing customer (user must approve). Pass id + only the fields to change.',
    {
      id: { type: 'integer' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      street: { type: 'string' },
      zip: { type: 'string' },
      city: { type: 'string' },
      paymentTermDays: { type: 'integer' },
      discountPercent: { type: 'number' }
    },
    ['id']
  ),
  fn(
    'propose_edit_invoice',
    'Propose changing an existing invoice (user must approve). Call get_invoice first. Pass id + changed fields; pass the FULL new lines array to change line items.',
    {
      id: { type: 'integer' },
      title: { type: 'string' },
      number: { type: 'string' },
      issueDate: { type: 'string' },
      dueDate: { type: 'string' },
      lines: { ...LINES_SCHEMA, minItems: 0 }
    },
    ['id']
  ),
  fn(
    'propose_edit_quote',
    'Propose changing an existing quote (user must approve). Call get_quote first. Pass id + changed fields; pass the FULL new lines array to change line items.',
    {
      id: { type: 'integer' },
      title: { type: 'string' },
      number: { type: 'string' },
      validUntil: { type: 'string' },
      lines: { ...LINES_SCHEMA, minItems: 0 }
    },
    ['id']
  ),
  fn(
    'propose_edit_article',
    'Propose changing an existing article (user must approve). Pass id + only the fields to change. price in CHF.',
    {
      id: { type: 'integer' },
      name: { type: 'string' },
      unit: { type: 'string' },
      price: { type: 'number' },
      mwst: { type: 'number' }
    },
    ['id']
  ),
  fn(
    'propose_edit_signature',
    'Propose changing an existing signature (user must approve). Pass id + fields to change.',
    {
      id: { type: 'integer' },
      name: { type: 'string' },
      contentHtml: { type: 'string' },
      isDefault: { type: 'boolean' }
    },
    ['id']
  )
]

// Helper to build an OpenAI function tool definition tersely.
function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[]
): OpenAITool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, ...(required ? { required } : {}) }
    }
  }
}

export const ALL_TOOLS: OpenAITool[] = [...READ_TOOLS, ...PROPOSE_TOOLS]

const PROPOSE_NAMES = new Set(PROPOSE_TOOLS.map((t) => t.function.name))
export function isProposeTool(name: string): boolean {
  return PROPOSE_NAMES.has(name)
}

// ---------------------------------------------------------------------------
// READ tool execution.
// ---------------------------------------------------------------------------

export function runReadTool(name: string, args: Record<string, unknown>): unknown {
  const db = useDb()
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50)
  const intArg = (v: unknown) => (Number.isInteger(Number(v)) ? Number(v) : null)

  switch (name) {
    case 'list_customers': {
      const search = String(args.search ?? '').trim()
      const rows = db
        .prepare(
          `SELECT id, name, email, city, payment_term_days FROM customers
           WHERE (? = '' OR name LIKE ?) ORDER BY name LIMIT ?`
        )
        .all(search, `%${search}%`, limit)
      return { customers: rows }
    }
    case 'find_customer': {
      const q = String(args.query ?? '').trim()
      if (!q) return { matches: [] }
      return {
        matches: db
          .prepare(
            `SELECT id, name, customer_number, email, payment_term_days FROM customers
             WHERE name LIKE ? OR customer_number LIKE ? ORDER BY name LIMIT 10`
          )
          .all(`%${q}%`, `%${q}%`)
      }
    }
    case 'list_invoices': {
      const clauses: string[] = []
      const params: unknown[] = []
      if (intArg(args.customerId) !== null) {
        clauses.push('i.customer_id = ?')
        params.push(intArg(args.customerId))
      }
      if (['draft', 'sent', 'paid'].includes(String(args.status))) {
        clauses.push('i.status = ?')
        params.push(String(args.status))
      }
      params.push(limit)
      return {
        invoices: db
          .prepare(
            `SELECT i.id, i.number, i.title, i.status, i.issue_date, i.due_date, c.name AS customer
             FROM invoices i JOIN customers c ON c.id = i.customer_id
             ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
             ORDER BY i.id DESC LIMIT ?`
          )
          .all(...params)
      }
    }
    case 'get_invoice': {
      const id = intArg(args.id)
      const invoice = id && db.prepare('SELECT * FROM invoices WHERE id = ?').get(id)
      if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found' })
      const items = db
        .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id')
        .all(id)
      return { invoice, items }
    }
    case 'list_quotes': {
      const clauses: string[] = []
      const params: unknown[] = []
      if (intArg(args.customerId) !== null) {
        clauses.push('q.customer_id = ?')
        params.push(intArg(args.customerId))
      }
      if (['draft', 'sent', 'accepted', 'declined'].includes(String(args.status))) {
        clauses.push('q.status = ?')
        params.push(String(args.status))
      }
      params.push(limit)
      return {
        quotes: db
          .prepare(
            `SELECT q.id, q.number, q.title, q.status, q.issue_date, q.valid_until, c.name AS customer
             FROM quotes q JOIN customers c ON c.id = q.customer_id
             ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
             ORDER BY q.id DESC LIMIT ?`
          )
          .all(...params)
      }
    }
    case 'get_quote': {
      const id = intArg(args.id)
      const quote = id && db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)
      if (!quote) throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
      const items = db
        .prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position, id')
        .all(id)
      const references = db
        .prepare(
          'SELECT id, label, url FROM quote_references WHERE quote_id = ? ORDER BY sort_order'
        )
        .all(id)
      return { quote, items, references }
    }
    case 'list_articles': {
      const search = String(args.search ?? '').trim()
      const customerId = intArg(args.customerId)
      return {
        articles: db
          .prepare(
            `SELECT id, name, unit, default_price_rappen, default_mwst FROM articles
             WHERE (customer_id IS NULL OR customer_id = ?) AND (? = '' OR name LIKE ?)
             ORDER BY name LIMIT 50`
          )
          .all(customerId, search, `%${search}%`)
      }
    }
    case 'list_signatures': {
      return {
        signatures: db.prepare('SELECT id, name, is_default FROM signatures ORDER BY name').all()
      }
    }
    case 'list_expenses': {
      return {
        expenses: db
          .prepare(
            `SELECT e.id, e.title, e.amount_rappen, e.date, e.vendor, c.name AS category
             FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
             ORDER BY e.date DESC, e.id DESC LIMIT ?`
          )
          .all(limit)
      }
    }
    case 'list_categories': {
      const type = ['expense', 'income'].includes(String(args.type)) ? String(args.type) : null
      return {
        categories: db
          .prepare(
            `SELECT id, name, type FROM categories WHERE (? IS NULL OR type = ?) ORDER BY type, name`
          )
          .all(type, type)
      }
    }
    case 'get_overview': {
      const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n
      return {
        customers: n('SELECT COUNT(*) AS n FROM customers'),
        invoices: n('SELECT COUNT(*) AS n FROM invoices'),
        quotes: n('SELECT COUNT(*) AS n FROM quotes'),
        vatRegistered: senderVat(),
        defaultMwstPercent: 8.1
      }
    }
    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown read tool: ${name}` })
  }
}

// ---------------------------------------------------------------------------
// PROPOSE tool handling: validate + build a Proposal. No writes.
// ---------------------------------------------------------------------------

export function buildProposal(name: string, args: Record<string, unknown>): Proposal {
  const db = useDb()

  switch (name) {
    case 'propose_customer': {
      const customerName = String(args.name ?? '').trim()
      if (!customerName)
        throw createError({ statusCode: 400, statusMessage: 'Customer name required' })
      const summary = [customerName]
      const place = [args.zip, args.city]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
        .join(' ')
      if (place) summary.push(place)
      if (args.email) summary.push(String(args.email))
      return {
        kind: 'customer',
        mode: 'create',
        summary,
        action: { type: 'create_customer', customer: { ...args } }
      }
    }

    case 'propose_invoice':
    case 'propose_quote': {
      const isQuote = name === 'propose_quote'
      const lines = parseLines(args.lines)
      if (lines.length === 0)
        throw createError({ statusCode: 400, statusMessage: 'Needs at least one line' })

      let customerLabel = ''
      let customerId: number | undefined
      let newCustomer: Record<string, unknown> | undefined
      if (args.newCustomer && typeof args.newCustomer === 'object') {
        newCustomer = args.newCustomer as Record<string, unknown>
        customerLabel = String(newCustomer.name ?? '').trim() || 'New customer'
      } else if (Number.isInteger(Number(args.customerId))) {
        customerId = Number(args.customerId)
        const row = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) as
          | { name: string }
          | undefined
        if (!row) throw createError({ statusCode: 400, statusMessage: 'Unknown customer' })
        customerLabel = row.name
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Needs a customer (customerId or newCustomer)'
        })
      }

      const title = String(args.title ?? '').trim()
      const summary = [customerLabel]
      if (title) summary.push(title)
      summary.push(...lineSummary(lines.length, linesTotalRappen(lines)))

      if (isQuote) {
        const refs = Array.isArray(args.references)
          ? (args.references as Record<string, unknown>[]).map((r) => ({
              label: String(r?.label ?? ''),
              url: String(r?.url ?? '')
            }))
          : undefined
        return {
          kind: 'quote',
          mode: 'create',
          summary,
          action: {
            type: 'create_quote',
            customerId,
            newCustomer,
            projectId: Number.isInteger(Number(args.projectId))
              ? Number(args.projectId)
              : undefined,
            title: title || undefined,
            validUntil: String(args.validUntil ?? '').trim() || undefined,
            lines,
            references: refs
          }
        }
      }
      return {
        kind: 'invoice',
        mode: 'create',
        summary,
        action: {
          type: 'create_invoice',
          customerId,
          newCustomer,
          projectId: Number.isInteger(Number(args.projectId)) ? Number(args.projectId) : undefined,
          newProjectName: String(args.newProjectName ?? '').trim() || undefined,
          title: title || undefined,
          lines
        }
      }
    }

    case 'propose_article': {
      const aName = String(args.name ?? '').trim()
      const price = Number(args.price)
      if (!aName || !Number.isFinite(price)) {
        throw createError({ statusCode: 400, statusMessage: 'Article needs a name and price' })
      }
      const mwst = Number.isFinite(Number(args.mwst)) ? Number(args.mwst) : 8.1
      return {
        kind: 'article',
        mode: 'create',
        summary: [aName, `CHF ${chf(Math.round(price * 100))} · ${mwst}% MWST`],
        action: { type: 'create_article', name: aName, unit: String(args.unit ?? ''), price, mwst }
      }
    }

    case 'propose_signature': {
      const sName = String(args.name ?? '').trim()
      if (!sName) throw createError({ statusCode: 400, statusMessage: 'Signature name required' })
      return {
        kind: 'signature',
        mode: 'create',
        summary: [sName, ...(args.isDefault ? ['default'] : [])],
        action: {
          type: 'create_signature',
          name: sName,
          contentHtml: String(args.contentHtml ?? ''),
          isDefault: args.isDefault === true
        }
      }
    }

    case 'propose_expense': {
      const title = String(args.title ?? '').trim()
      const amount = Number(args.amount)
      const date = String(args.date ?? '').trim()
      if (!title || !Number.isFinite(amount) || amount <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Expense needs a title and amount' })
      }
      const cat = String(args.categoryName ?? '').trim()
      const summary = [title, `CHF ${chf(Math.round(amount * 100))}`, date]
      if (cat) summary.push(cat)
      return {
        kind: 'expense',
        mode: 'create',
        summary,
        action: {
          type: 'create_expense',
          title,
          amount,
          date,
          categoryName: cat || undefined,
          vendor: String(args.vendor ?? '').trim() || undefined,
          notes: String(args.notes ?? '').trim() || undefined
        }
      }
    }

    case 'propose_income': {
      const company = String(args.company ?? '').trim()
      const salary = Number(args.salary)
      if (!company || !Number.isFinite(salary)) {
        throw createError({ statusCode: 400, statusMessage: 'Income needs a company and salary' })
      }
      return {
        kind: 'income',
        mode: 'create',
        summary: [company, `CHF ${chf(Math.round(salary * 100))} / month`],
        action: {
          type: 'create_income',
          company,
          jobTitle: String(args.jobTitle ?? '').trim() || undefined,
          salary,
          payoutDay: Number(args.payoutDay),
          canton: String(args.canton ?? '').trim(),
          payoutRule: String(args.payoutRule ?? 'earlier')
        }
      }
    }

    case 'propose_edit_customer': {
      const id = Number(args.id)
      const cur = db
        .prepare('SELECT name, email, city, payment_term_days FROM customers WHERE id = ?')
        .get(id) as
        | { name: string; email: string | null; city: string | null; payment_term_days: number }
        | undefined
      if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown customer' })
      const changes: Record<string, unknown> = {}
      for (const k of [
        'name',
        'email',
        'phone',
        'street',
        'zip',
        'city',
        'paymentTermDays',
        'discountPercent'
      ]) {
        if (args[k] !== undefined) changes[k] = args[k]
      }
      if (Object.keys(changes).length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'No changes specified' })
      }
      return {
        kind: 'customer',
        mode: 'edit',
        before: [cur.name, cur.city || '', cur.email || ''].filter(Boolean),
        summary: Object.entries(changes).map(([k, v]) => `${k}: ${v}`),
        action: { type: 'edit_customer', id, changes }
      }
    }

    case 'propose_edit_invoice':
    case 'propose_edit_quote': {
      const isQuote = name === 'propose_edit_quote'
      const id = Number(args.id)
      const table = isQuote ? 'quotes' : 'invoices'
      const itemsTable = isQuote ? 'quote_items' : 'invoice_items'
      const fk = isQuote ? 'quote_id' : 'invoice_id'
      const cur = db.prepare(`SELECT number, title FROM ${table} WHERE id = ?`).get(id) as
        | { number: string; title: string }
        | undefined
      if (!cur)
        throw createError({
          statusCode: 400,
          statusMessage: `Unknown ${isQuote ? 'quote' : 'invoice'}`
        })

      const before: string[] = [cur.title || cur.number || `#${id}`]
      const curItems = db
        .prepare(
          `SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM ${itemsTable} WHERE ${fk} = ?`
        )
        .all(id) as {
        quantity: number
        unit_price_rappen: number
        discount_percent: number
        mwst_percent: number
      }[]
      before.push(
        ...lineSummary(
          curItems.length,
          computeInvoiceTotals(
            curItems.map((it) => ({
              quantity: it.quantity,
              unitPriceRappen: it.unit_price_rappen,
              discountPercent: it.discount_percent,
              mwstPercent: it.mwst_percent
            })),
            senderVat()
          ).totalRappen
        )
      )

      const lines = args.lines !== undefined ? parseLines(args.lines) : undefined
      const title = args.title !== undefined ? String(args.title).trim() : cur.title
      const summary: string[] = [title || cur.number || `#${id}`]
      if (lines) summary.push(...lineSummary(lines.length, linesTotalRappen(lines)))
      else summary.push(...before.slice(1))

      const action = isQuote
        ? {
            type: 'edit_quote' as const,
            id,
            title: args.title !== undefined ? String(args.title) : undefined,
            number: args.number !== undefined ? String(args.number) : undefined,
            validUntil: args.validUntil !== undefined ? String(args.validUntil) : undefined,
            lines
          }
        : {
            type: 'edit_invoice' as const,
            id,
            title: args.title !== undefined ? String(args.title) : undefined,
            number: args.number !== undefined ? String(args.number) : undefined,
            issueDate: args.issueDate !== undefined ? String(args.issueDate) : undefined,
            dueDate: args.dueDate !== undefined ? String(args.dueDate) : undefined,
            lines
          }
      return { kind: isQuote ? 'quote' : 'invoice', mode: 'edit', before, summary, action }
    }

    case 'propose_edit_article': {
      const id = Number(args.id)
      const cur = db
        .prepare('SELECT name, unit, default_price_rappen, default_mwst FROM articles WHERE id = ?')
        .get(id) as
        | { name: string; unit: string; default_price_rappen: number; default_mwst: number }
        | undefined
      if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown article' })
      const changes: Record<string, unknown> = {}
      for (const k of ['name', 'unit', 'price', 'mwst'])
        if (args[k] !== undefined) changes[k] = args[k]
      if (Object.keys(changes).length === 0)
        throw createError({ statusCode: 400, statusMessage: 'No changes specified' })
      return {
        kind: 'article',
        mode: 'edit',
        before: [cur.name, `CHF ${chf(cur.default_price_rappen)} · ${cur.default_mwst}%`],
        summary: Object.entries(changes).map(([k, v]) => `${k}: ${v}`),
        action: { type: 'edit_article', id, changes }
      }
    }

    case 'propose_edit_signature': {
      const id = Number(args.id)
      const cur = db.prepare('SELECT name FROM signatures WHERE id = ?').get(id) as
        | { name: string }
        | undefined
      if (!cur) throw createError({ statusCode: 400, statusMessage: 'Unknown signature' })
      const summary: string[] = []
      if (args.name !== undefined) summary.push(`name: ${String(args.name)}`)
      if (args.contentHtml !== undefined) summary.push('updated content')
      if (args.isDefault === true) summary.push('set as default')
      if (summary.length === 0)
        throw createError({ statusCode: 400, statusMessage: 'No changes specified' })
      return {
        kind: 'signature',
        mode: 'edit',
        before: [cur.name],
        summary,
        action: {
          type: 'edit_signature',
          id,
          name: args.name !== undefined ? String(args.name) : undefined,
          contentHtml: args.contentHtml !== undefined ? String(args.contentHtml) : undefined,
          isDefault: args.isDefault === true ? true : undefined
        }
      }
    }

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown propose tool: ${name}` })
  }
}
