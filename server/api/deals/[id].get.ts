interface DealDetail {
  id: number
  name: string
  customer_id: number | null
  customer_name: string | null
  // Resolved fields: prefer the linked customer's email/phone when present,
  // otherwise fall back to the deal's own inline values.
  customer_email: string | null
  customer_phone: string | null
  // Raw deal-level inputs, exposed so the edit form can repopulate them.
  email: string | null
  phone: string | null
  direction: 'sales' | 'procurement'
  stage: string
  label: string
  value_rappen: number
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

  const row = useDb().prepare(
    `SELECT d.id, d.name, d.customer_id, c.name AS customer_name,
            COALESCE(c.email, d.email) AS customer_email,
            COALESCE(c.phone, d.phone) AS customer_phone,
            d.email, d.phone,
            d.direction, d.stage, d.label, d.value_rappen,
            d.due_date, d.notes, d.created_at, d.updated_at
     FROM deals d
     LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.id = ?`
  ).get(id) as DealDetail | undefined

  if (!row) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return row
})
