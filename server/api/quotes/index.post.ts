// Create a draft quote. Unlike invoices (always scoped to a project),
// quotes commonly start as a one-off proposal to a customer before a
// project even exists, so project_id is optional. Customer is required;
// the rest is filled in by the editor.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody(event)

  const customerId = Number(body?.customerId)
  const projectId = body?.projectId == null ? null : Number(body.projectId)
  if (!Number.isInteger(customerId)) {
    throw createError({ statusCode: 400, statusMessage: 'customerId is required' })
  }

  const db = useDb()
  const customer = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customerId) as
    | { id: number; name: string }
    | undefined
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }
  if (projectId != null) {
    const project = db.prepare('SELECT customer_id FROM projects WHERE id = ?').get(projectId) as
      | { customer_id: number | null }
      | undefined
    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }
    if (project.customer_id !== customerId) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Project does not belong to the selected customer'
      })
    }
  }

  const issue = new Date().toISOString().slice(0, 10)
  // Default validity: 30 days. Editor can change it.
  const validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO quotes (customer_id, project_id, number, title, issue_date, valid_until)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(customerId, projectId, '', '', issue, validUntil)

  return { id: lastInsertRowid }
})
