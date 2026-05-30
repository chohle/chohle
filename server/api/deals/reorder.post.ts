type Direction = 'sales' | 'procurement'
type Stage = 'lead' | 'contacted' | 'proposal' | 'won' | 'need' | 'requested' | 'received' | 'accepted'

interface Body {
  direction: Direction
  // ordered list of deal IDs in each stage, per the new client-side state
  stages: Partial<Record<Stage, number[]>>
}

const SALES_STAGES: ReadonlySet<Stage> = new Set<Stage>(['lead', 'contacted', 'proposal', 'won'])
const PROC_STAGES: ReadonlySet<Stage> = new Set<Stage>(['need', 'requested', 'received', 'accepted'])

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<Body>(event)
  if (!body?.stages) {
    throw createError({ statusCode: 400, statusMessage: 'stages required' })
  }
  const direction: Direction = body.direction === 'procurement' ? 'procurement' : 'sales'
  const allowed = direction === 'procurement' ? PROC_STAGES : SALES_STAGES

  const db = useDb()
  // Direction is checked at the row level so a stale or hostile client
  // can't sneak a sales deal into a procurement column (and vice versa).
  const update = db.prepare(
    `UPDATE deals SET stage = ?, position = ?, updated_at = datetime('now')
     WHERE id = ? AND direction = ?`
  )
  db.transaction(() => {
    for (const stage of Object.keys(body.stages) as Stage[]) {
      if (!allowed.has(stage)) continue
      const ids = body.stages[stage]
      if (!ids) continue
      ids.forEach((id, position) => update.run(stage, position, id, direction))
    }
  })()

  return { ok: true }
})
