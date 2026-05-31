type Direction = 'sales' | 'procurement'
type SalesStage = 'lead' | 'contacted' | 'proposal' | 'won'
type ProcStage = 'need' | 'requested' | 'received' | 'accepted'
// `active` and `completed` are valid sales stages but don't appear as
// kanban columns. They're surfaced via dedicated views (and tracked here
// only via the type, not via the SALES_STAGES list below).
type PostSales = 'active' | 'completed'
type Stage = SalesStage | ProcStage | PostSales

interface ProjectRow {
  id: number
  name: string
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  email: string | null
  phone: string | null
  direction: Direction
  stage: Stage
  label: string
  budget_rappen: number
  budget_type: string
  due_date: string | null
  notes: string | null
  position: number
}

const SALES_STAGES: SalesStage[] = ['lead', 'contacted', 'proposal', 'won']
const PROC_STAGES: ProcStage[] = ['need', 'requested', 'received', 'accepted']

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const q = getQuery(event).direction
  const direction: Direction = q === 'procurement' ? 'procurement' : 'sales'
  const stageList: Stage[] = direction === 'procurement' ? PROC_STAGES : SALES_STAGES

  const db = useDb()
  const rows = db.prepare(
    `SELECT p.id, p.name, p.customer_id, c.name AS customer_name,
            COALESCE(c.email, p.email) AS customer_email,
            p.email, p.phone,
            p.direction, p.stage, p.label, p.budget_rappen, p.budget_type,
            p.due_date, p.notes, p.position
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.direction = ?
     ORDER BY p.stage, p.position, p.id`
  ).all(direction) as ProjectRow[]

  const stages = Object.fromEntries(stageList.map(s => [s, [] as ProjectRow[]])) as Record<Stage, ProjectRow[]>
  const totals = Object.fromEntries(stageList.map(s => [s, 0])) as Record<Stage, number>

  for (const r of rows) {
    if (!(r.stage in stages)) continue
    stages[r.stage]!.push(r)
    totals[r.stage]! += r.budget_rappen
  }

  return { direction, stages, totals }
})
