interface ProjectDetail {
  id: number
  name: string
  customer_id: number | null
  customer_name: string | null
  // Resolved fields: prefer the linked customer's email/phone when present,
  // otherwise fall back to the project's own inline values.
  customer_email: string | null
  customer_phone: string | null
  // Raw project-level inputs, exposed so the edit form can repopulate them.
  email: string | null
  phone: string | null
  direction: 'sales' | 'procurement'
  stage: string
  label: string
  budget_rappen: number
  budget_type: string
  due_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const row = useDb()
    .prepare(
      `SELECT p.id, p.name, p.customer_id, c.name AS customer_name,
            COALESCE(c.email, p.email) AS customer_email,
            COALESCE(c.phone, p.phone) AS customer_phone,
            p.email, p.phone,
            p.direction, p.stage, p.label, p.budget_rappen, p.budget_type,
            p.due_date, p.notes, p.created_at, p.updated_at
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.id = ?`
    )
    .get(id) as ProjectDetail | undefined

  if (!row) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return row
})
