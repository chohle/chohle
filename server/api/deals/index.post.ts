type Direction = 'sales' | 'procurement'
type Stage = 'lead' | 'contacted' | 'proposal' | 'won' | 'need' | 'requested' | 'received' | 'accepted'

interface Body {
  name?: string
  customer_id?: number | null
  direction?: Direction
  stage?: Stage
  label?: string
  value?: number
  due_date?: string | null
  notes?: string | null
  email?: string | null
  phone?: string | null
}

const SALES_STAGES: readonly Stage[] = ['lead', 'contacted', 'proposal', 'won']
const PROC_STAGES: readonly Stage[] = ['need', 'requested', 'received', 'accepted']

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<Body>(event)

  const name = (body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const direction: Direction = body.direction === 'procurement' ? 'procurement' : 'sales'
  const validStages = direction === 'procurement' ? PROC_STAGES : SALES_STAGES
  const fallback = direction === 'procurement' ? 'need' : 'lead'
  const stage: Stage = body.stage && validStages.includes(body.stage) ? body.stage : fallback as Stage

  const valueRappen = Math.round((body.value ?? 0) * 100)
  const customerId = body.customer_id ?? null
  const label = (body.label ?? '').trim()
  const dueDate = body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null
  const notes = body.notes ?? null
  const email = body.email?.trim() || null
  const phone = body.phone?.trim() || null

  const db = useDb()
  const nextPos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM deals WHERE direction = ? AND stage = ?`
  ).get(direction, stage) as { p: number }

  const info = db.prepare(
    `INSERT INTO deals (name, customer_id, direction, stage, label, value_rappen,
                        due_date, notes, position, email, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(name, customerId, direction, stage, label, valueRappen, dueDate, notes, nextPos.p, email, phone)

  return { id: info.lastInsertRowid }
})
