type Direction = 'sales' | 'procurement'
type Stage = 'lead' | 'contacted' | 'proposal' | 'won' | 'active' | 'completed' | 'need' | 'requested' | 'received' | 'accepted'
type BudgetType = 'fixed' | 'hourly' | 'estimate'

interface Body {
  name?: string
  customer_id?: number | null
  direction?: Direction
  stage?: Stage
  label?: string
  budget?: number
  budget_type?: BudgetType
  due_date?: string | null
  notes?: string | null
  email?: string | null
  phone?: string | null
}

// Includes the post-pipeline lifecycle stages so the server accepts moves
// into 'active' and 'completed'. The kanban GET filters these out.
const SALES_STAGES: readonly Stage[] = ['lead', 'contacted', 'proposal', 'won', 'active', 'completed']
const PROC_STAGES: readonly Stage[] = ['need', 'requested', 'received', 'accepted']
const BUDGET_TYPES: ReadonlySet<BudgetType> = new Set(['fixed', 'hourly', 'estimate'])

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<Body>(event)

  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const direction: Direction = body.direction === 'procurement' ? 'procurement' : 'sales'
  const validStages = direction === 'procurement' ? PROC_STAGES : SALES_STAGES
  const fallback = direction === 'procurement' ? 'need' : 'lead'
  const stage: Stage = body.stage && validStages.includes(body.stage) ? body.stage : fallback as Stage

  // Budget is optional (defaults to 0) but if supplied it must be a real,
  // non-negative number; NaN / Infinity / negatives would silently corrupt
  // the burn calculations otherwise.
  const rawBudget = body.budget ?? 0
  if (!Number.isFinite(rawBudget) || rawBudget < 0) {
    throw createError({ statusCode: 400, statusMessage: 'budget must be a non-negative number' })
  }
  const budgetRappen = Math.round(rawBudget * 100)
  const budgetType: BudgetType = body.budget_type && BUDGET_TYPES.has(body.budget_type) ? body.budget_type : 'fixed'
  const customerId = body.customer_id ?? null
  const label = (body.label ?? '').trim()
  const dueDate = body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null
  const notes = body.notes ?? null
  const email = body.email?.trim() || null
  const phone = body.phone?.trim() || null

  const db = useDb()
  const nextPos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM projects WHERE direction = ? AND stage = ?`
  ).get(direction, stage) as { p: number }

  const info = db.prepare(
    `INSERT INTO projects (name, customer_id, direction, stage, label, budget_rappen, budget_type,
                           due_date, notes, position, email, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, customerId, direction, stage, label, budgetRappen, budgetType, dueDate, notes, nextPos.p, email, phone)

  return { id: info.lastInsertRowid }
})
