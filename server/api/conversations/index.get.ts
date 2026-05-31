// Returns one row per project that has at least one email, with summary
// info for the left-hand list view of /conversations (latest message
// timestamp, total + unread/inbound count, customer + project labels).

interface ThreadRow {
  project_id: number
  project_name: string
  project_direction: 'sales' | 'procurement'
  project_stage: string
  customer_id: number | null
  customer_name: string | null
  total: number
  inbound: number
  outbound: number
  last_at: string
  last_subject: string
  last_direction: 'inbound' | 'outbound'
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  return useDb()
    .prepare(
      `SELECT
         p.id   AS project_id,
         p.name AS project_name,
         p.direction AS project_direction,
         p.stage AS project_stage,
         p.customer_id AS customer_id,
         c.name AS customer_name,
         COUNT(e.id) AS total,
         SUM(CASE WHEN e.direction = 'inbound'  THEN 1 ELSE 0 END) AS inbound,
         SUM(CASE WHEN e.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
         MAX(e.sent_at) AS last_at,
         (SELECT subject   FROM project_emails WHERE project_id = p.id ORDER BY sent_at DESC, id DESC LIMIT 1) AS last_subject,
         (SELECT direction FROM project_emails WHERE project_id = p.id ORDER BY sent_at DESC, id DESC LIMIT 1) AS last_direction
       FROM projects p
       JOIN project_emails e ON e.project_id = p.id
       LEFT JOIN customers  c ON c.id = p.customer_id
       GROUP BY p.id
       ORDER BY last_at DESC, p.id DESC`
    )
    .all() as ThreadRow[]
})
