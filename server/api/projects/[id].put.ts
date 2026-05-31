type Stage =
  | 'lead'
  | 'contacted'
  | 'proposal'
  | 'won'
  | 'active'
  | 'completed'
  | 'need'
  | 'requested'
  | 'received'
  | 'accepted'
type BudgetType = 'fixed' | 'hourly' | 'estimate'

interface Body {
  name?: string
  customer_id?: number | null
  stage?: Stage
  label?: string
  budget?: number
  budget_type?: BudgetType
  due_date?: string | null
  notes?: string | null
  email?: string | null
  phone?: string | null
}

const SALES_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'lead',
  'contacted',
  'proposal',
  'won',
  'active',
  'completed'
])
const PROC_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'need',
  'requested',
  'received',
  'accepted'
])
const BUDGET_TYPES: ReadonlySet<BudgetType> = new Set<BudgetType>(['fixed', 'hourly', 'estimate'])

function stagesFor(direction: 'sales' | 'procurement') {
  return direction === 'procurement' ? PROC_STAGES : SALES_STAGES
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const body = await readBody<Body>(event)
  const db = useDb()

  const existing = db.prepare(`SELECT id, direction, stage FROM projects WHERE id = ?`).get(id) as
    | { id: number; direction: 'sales' | 'procurement'; stage: Stage }
    | undefined
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'not found' })
  }

  const name = body.name?.trim()
  // Stages are direction-specific. Reject a procurement stage on a sales
  // project (and vice versa) instead of silently mixing them.
  const allowed = stagesFor(existing.direction)
  const stage: Stage | undefined = body.stage && allowed.has(body.stage) ? body.stage : undefined
  if (body.stage && !stage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'stage is not valid for this project direction'
    })
  }
  const label = body.label?.trim()
  const budgetRappen = body.budget != null ? Math.round(body.budget * 100) : undefined
  const budgetType: BudgetType | undefined =
    body.budget_type && BUDGET_TYPES.has(body.budget_type) ? body.budget_type : undefined
  const dueDate =
    body.due_date === null
      ? null
      : body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
        ? body.due_date
        : undefined
  const notes = body.notes
  const customerId = body.customer_id
  // Treat empty string as 'clear' so the user can wipe a field.
  const email = body.email === undefined ? undefined : body.email?.trim() || null
  const phone = body.phone === undefined ? undefined : body.phone?.trim() || null

  let position: number | undefined
  if (stage && stage !== existing.stage) {
    const next = db
      .prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM projects WHERE direction = ? AND stage = ?`
      )
      .get(existing.direction, stage) as { p: number }
    position = next.p
  }

  const updates: string[] = []
  const params: unknown[] = []
  function add(col: string, value: unknown) {
    if (value === undefined) return
    updates.push(`${col} = ?`)
    params.push(value)
  }
  add('name', name)
  add('customer_id', customerId)
  add('stage', stage)
  add('label', label)
  add('budget_rappen', budgetRappen)
  add('budget_type', budgetType)
  add('due_date', dueDate)
  add('notes', notes)
  add('position', position)
  add('email', email)
  add('phone', phone)
  if (!updates.length) return { ok: true }

  updates.push(`updated_at = datetime('now')`)
  params.push(id)
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return { ok: true }
})
