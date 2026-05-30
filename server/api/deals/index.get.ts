type Direction = 'sales' | 'procurement'
type SalesStage = 'lead' | 'contacted' | 'proposal' | 'won'
type ProcStage = 'need' | 'requested' | 'received' | 'accepted'
type Stage = SalesStage | ProcStage

interface DealRow {
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
  value_rappen: number
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
    `SELECT d.id, d.name, d.customer_id, c.name AS customer_name,
            COALESCE(c.email, d.email) AS customer_email,
            d.email, d.phone,
            d.direction, d.stage, d.label, d.value_rappen, d.due_date, d.notes, d.position
     FROM deals d
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.direction = ?
     ORDER BY d.stage, d.position, d.id`
  ).all(direction) as DealRow[]

  const stages = Object.fromEntries(stageList.map(s => [s, [] as DealRow[]])) as Record<Stage, DealRow[]>
  const totals = Object.fromEntries(stageList.map(s => [s, 0])) as Record<Stage, number>

  for (const r of rows) {
    if (!(r.stage in stages)) continue
    stages[r.stage]!.push(r)
    totals[r.stage]! += r.value_rappen
  }

  return { direction, stages, totals }
})
