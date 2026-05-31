type Scope = 'all' | 'invoices' | 'customers' | 'articles' | 'expenses' | 'projects'
const SCOPES: ReadonlySet<Scope> = new Set([
  'all',
  'invoices',
  'customers',
  'articles',
  'expenses',
  'projects'
])

interface SearchPayload {
  invoices: unknown[]
  customers: unknown[]
  articles: unknown[]
  expenses: unknown[]
  projects: unknown[]
}

export default defineEventHandler(async (event): Promise<SearchPayload> => {
  await requireUserSession(event)

  const { q, scope } = getQuery(event)
  const term = String(q ?? '').trim()
  const empty: SearchPayload = {
    invoices: [],
    customers: [],
    articles: [],
    expenses: [],
    projects: []
  }
  if (term.length < 1) return empty

  const requested = String(scope ?? 'all') as Scope
  const active: Scope = SCOPES.has(requested) ? requested : 'all'
  const want = (s: Scope) => active === 'all' || active === s

  // Escape the ESCAPE char itself first, then the wildcards. Without the
  // backslash pass, a search term containing "\" would let following chars
  // act as escape sequences and break the LIKE pattern.
  const like = `%${term.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => '\\' + c)}%`
  const db = useDb()
  const limit = 8
  const out: SearchPayload = { ...empty }

  if (want('invoices')) {
    out.invoices = db
      .prepare(
        `SELECT i.id, i.number, i.title, c.name AS customer_name
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE i.number LIKE ? ESCAPE '\\' OR i.title LIKE ? ESCAPE '\\'
         ORDER BY i.issue_date DESC, i.id DESC LIMIT ?`
      )
      .all(like, like, limit)
  }

  if (want('customers')) {
    out.customers = db
      .prepare(
        `SELECT id, name, customer_number, city
         FROM customers
         WHERE name LIKE ? ESCAPE '\\' OR customer_number LIKE ? ESCAPE '\\'
         ORDER BY name LIMIT ?`
      )
      .all(like, like, limit)
  }

  if (want('articles')) {
    out.articles = db
      .prepare(
        `SELECT id, name, unit, default_price_rappen
         FROM articles
         WHERE name LIKE ? ESCAPE '\\'
         ORDER BY name LIMIT ?`
      )
      .all(like, limit)
  }

  if (want('expenses')) {
    out.expenses = db
      .prepare(
        `SELECT id, title, vendor, date, amount_rappen
         FROM expenses
         WHERE title LIKE ? ESCAPE '\\' OR vendor LIKE ? ESCAPE '\\'
         ORDER BY date DESC, id DESC LIMIT ?`
      )
      .all(like, like, limit)
  }

  if (want('projects')) {
    out.projects = db
      .prepare(
        `SELECT p.id, p.name, p.direction, p.stage, c.name AS customer_name
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.name LIKE ? ESCAPE '\\' OR p.label LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'
         ORDER BY p.updated_at DESC, p.id DESC LIMIT ?`
      )
      .all(like, like, like, limit)
  }

  return out
})
