type Stage = 'lead' | 'contacted' | 'proposal' | 'won' | 'need' | 'requested' | 'received' | 'accepted'

interface Body {
  name?: string
  customer_id?: number | null
  stage?: Stage
  label?: string
  value?: number
  due_date?: string | null
  notes?: string | null
  email?: string | null
  phone?: string | null
}

const SALES_STAGES: ReadonlySet<Stage> = new Set<Stage>(['lead', 'contacted', 'proposal', 'won'])
const PROC_STAGES: ReadonlySet<Stage> = new Set<Stage>(['need', 'requested', 'received', 'accepted'])

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

  const existing = db.prepare(
    `SELECT id, direction, stage FROM deals WHERE id = ?`
  ).get(id) as { id: number; direction: 'sales' | 'procurement'; stage: Stage } | undefined
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'not found' })
  }

  const name = body.name?.trim()
  // Stages are direction-specific — reject a procurement stage on a sales
  // deal (and vice versa) instead of silently mixing them.
  const allowed = stagesFor(existing.direction)
  const stage: Stage | undefined = body.stage && allowed.has(body.stage) ? body.stage : undefined
  if (body.stage && !stage) {
    throw createError({ statusCode: 400, statusMessage: 'stage is not valid for this deal direction' })
  }
  const label = body.label?.trim()
  const valueRappen = body.value != null ? Math.round(body.value * 100) : undefined
  const dueDate = body.due_date === null
    ? null
    : (body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : undefined)
  const notes = body.notes
  const customerId = body.customer_id
  // Treat empty string as 'clear' so the user can wipe a field.
  const email = body.email === undefined ? undefined : (body.email?.trim() || null)
  const phone = body.phone === undefined ? undefined : (body.phone?.trim() || null)

  let position: number | undefined
  if (stage && stage !== existing.stage) {
    const next = db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM deals WHERE direction = ? AND stage = ?`
    ).get(existing.direction, stage) as { p: number }
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
  add('value_rappen', valueRappen)
  add('due_date', dueDate)
  add('notes', notes)
  add('position', position)
  add('email', email)
  add('phone', phone)
  if (!updates.length) return { ok: true }

  updates.push(`updated_at = datetime('now')`)
  params.push(id)
  db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return { ok: true }
})
