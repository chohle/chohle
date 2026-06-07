// The assistant's tool registry. Two kinds:
//   - READ tools execute immediately against the db and feed results back to
//     the model so it can ground its answers.
//   - PROPOSE tools NEVER write. They validate the arguments and return a
//     Proposal (a preview + a normalized ProposedAction) and stop the loop, so
//     the user can approve before anything is committed.
// There is deliberately no delete/update tool, so the assistant cannot destroy
// or alter data by construction.
import { computeInvoiceTotals } from '../../../shared/utils/invoice'
import type { ProposedAction, ProposedInvoiceLine } from './commit'

export interface OpenAITool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

// A pending write surfaced to the UI as an approval card.
export interface Proposal {
  // Localization key for the card heading, e.g. 'newCustomer' | 'newInvoice'.
  kind: 'customer' | 'invoice'
  // Short human-readable lines for the card body.
  summary: string[]
  // The exact action re-sent to /commit on approval.
  action: ProposedAction
}

const round2 = (n: number) => Math.round(n * 100) / 100
function chf(rappen: number): string {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// ---------------------------------------------------------------------------
// Tool definitions sent to the model (OpenAI function-calling schema).
// ---------------------------------------------------------------------------

export const READ_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: 'List customers, optionally filtered by a name substring.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'name substring filter' },
          limit: { type: 'integer', default: 20 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_customer',
      description:
        'Resolve a customer name or number to its id. Call this before proposing an invoice for an existing customer.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: { query: { type: 'string', description: 'customer name or number' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: 'List recent invoices, optionally filtered by customer id or status.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'integer' },
          status: { type: 'string', enum: ['draft', 'sent', 'paid'] },
          limit: { type: 'integer', default: 20 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_articles',
      description:
        'List saved articles (catalog) with their default price and VAT, so invoice lines can reference an article id.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          customerId: { type: 'integer', description: "include this customer's articles too" }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description: 'A small summary: counts of customers/invoices and the VAT-registered flag.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

export const PROPOSE_TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'propose_customer',
      description:
        'Propose creating a new customer. Does NOT create it — the user must approve. Only "name" is required.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
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
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_invoice',
      description:
        'Propose creating a draft invoice. Does NOT create it — the user must approve. Reference an existing customer by customerId (use find_customer first) OR pass newCustomer to create one. Prices are in CHF.',
      parameters: {
        type: 'object',
        required: ['lines'],
        properties: {
          customerId: { type: 'integer', description: 'existing customer id from find_customer' },
          newCustomer: {
            type: 'object',
            description: 'create a new customer (same fields as propose_customer; name required)',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              city: { type: 'string' },
              paymentTermDays: { type: 'integer' }
            }
          },
          projectId: { type: 'integer', description: 'attach to an existing project' },
          newProjectName: { type: 'string', description: 'create a new project with this name' },
          title: { type: 'string', description: 'invoice title (also used as project name)' },
          lines: {
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
        }
      }
    }
  }
]

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

  switch (name) {
    case 'list_customers': {
      const search = String(args.search ?? '').trim()
      const rows = search
        ? db
            .prepare(
              `SELECT id, name, email, city, payment_term_days FROM customers
               WHERE name LIKE ? ORDER BY name LIMIT ?`
            )
            .all(`%${search}%`, limit)
        : db
            .prepare(
              `SELECT id, name, email, city, payment_term_days FROM customers ORDER BY name LIMIT ?`
            )
            .all(limit)
      return { customers: rows }
    }
    case 'find_customer': {
      const q = String(args.query ?? '').trim()
      if (!q) return { matches: [] }
      const rows = db
        .prepare(
          `SELECT id, name, customer_number, email, payment_term_days FROM customers
           WHERE name LIKE ? OR customer_number LIKE ? ORDER BY name LIMIT 10`
        )
        .all(`%${q}%`, `%${q}%`)
      return { matches: rows }
    }
    case 'list_invoices': {
      const clauses: string[] = []
      const params: unknown[] = []
      if (Number.isInteger(Number(args.customerId))) {
        clauses.push('i.customer_id = ?')
        params.push(Number(args.customerId))
      }
      if (['draft', 'sent', 'paid'].includes(String(args.status))) {
        clauses.push('i.status = ?')
        params.push(String(args.status))
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      params.push(limit)
      const rows = db
        .prepare(
          `SELECT i.id, i.number, i.title, i.status, i.issue_date, i.due_date, c.name AS customer
           FROM invoices i JOIN customers c ON c.id = i.customer_id
           ${where} ORDER BY i.id DESC LIMIT ?`
        )
        .all(...params)
      return { invoices: rows }
    }
    case 'list_articles': {
      const search = String(args.search ?? '').trim()
      const customerId = Number.isInteger(Number(args.customerId)) ? Number(args.customerId) : null
      const rows = db
        .prepare(
          `SELECT id, name, unit, default_price_rappen, default_mwst FROM articles
           WHERE (customer_id IS NULL OR customer_id = ?)
             AND (? = '' OR name LIKE ?)
           ORDER BY name LIMIT 50`
        )
        .all(customerId, search, `%${search}%`)
      return { articles: rows }
    }
    case 'get_overview': {
      const customers = (db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number }).n
      const invoices = (db.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number }).n
      const vatRegistered = !!(
        db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
          | { vat_registered: number }
          | undefined
      )?.vat_registered
      return { customers, invoices, vatRegistered, defaultMwstPercent: 8.1 }
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

  if (name === 'propose_customer') {
    const customerName = String(args.name ?? '').trim()
    if (!customerName) {
      throw createError({ statusCode: 400, statusMessage: 'Customer name is required' })
    }
    const summary = [customerName]
    const place = [args.zip, args.city]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' ')
    if (place) summary.push(place)
    if (args.email) summary.push(String(args.email))
    return {
      kind: 'customer',
      summary,
      action: { type: 'create_customer', customer: { ...args } }
    }
  }

  if (name === 'propose_invoice') {
    const rawLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : []
    if (rawLines.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Invoice needs at least one line' })
    }
    const lines: ProposedInvoiceLine[] = rawLines.map((l) => ({
      description: String(l?.description ?? '').trim(),
      quantity: Number(l?.quantity) || 0,
      unitPriceChf: Number(l?.unitPriceChf) || 0,
      unit: String(l?.unit ?? '').trim() || undefined,
      discountPercent: Number(l?.discountPercent) || 0,
      mwstPercent: Number.isFinite(Number(l?.mwstPercent)) ? Number(l?.mwstPercent) : 8.1,
      articleId: Number.isInteger(Number(l?.articleId)) ? Number(l?.articleId) : null
    }))

    // Resolve the customer label for the card.
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
        statusMessage: 'Invoice needs a customer (customerId or newCustomer)'
      })
    }

    const vat = !!(
      db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
        | { vat_registered: number }
        | undefined
    )?.vat_registered
    const { totalRappen } = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPriceRappen: Math.round(l.unitPriceChf * 100),
        discountPercent: l.discountPercent ?? 0,
        mwstPercent: l.mwstPercent ?? 8.1
      })),
      vat
    )

    const title = String(args.title ?? '').trim()
    const summary = [customerLabel]
    if (title) summary.push(title)
    summary.push(`${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`)
    summary.push(`CHF ${chf(totalRappen)}${vat ? ' incl. MWST' : ''}`)

    return {
      kind: 'invoice',
      summary,
      action: {
        type: 'create_invoice',
        customerId,
        newCustomer,
        projectId: Number.isInteger(Number(args.projectId)) ? Number(args.projectId) : undefined,
        newProjectName: String(args.newProjectName ?? '').trim() || undefined,
        title: title || undefined,
        lines: lines.map((l) => ({ ...l, unitPriceChf: round2(l.unitPriceChf) }))
      }
    }
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown propose tool: ${name}` })
}
