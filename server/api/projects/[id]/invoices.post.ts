// Create an invoice scoped to a project. Pulls the customer from the project,
// sets a sensible due date based on the customer's payment term, and stamps
// the new invoice with project_id so the link is preserved.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const project = db
    .prepare('SELECT id, customer_id, name, label FROM projects WHERE id = ?')
    .get(projectId) as
    | { id: number; customer_id: number | null; name: string; label: string }
    | undefined
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  if (!project.customer_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project has no linked customer; link one before invoicing'
    })
  }

  const customer = db
    .prepare('SELECT payment_term_days FROM customers WHERE id = ?')
    .get(project.customer_id) as { payment_term_days: number } | undefined
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  }

  const now = new Date()
  const issue = now.toISOString().slice(0, 10)
  const due = new Date(now.getTime() + customer.payment_term_days * 86_400_000)
    .toISOString()
    .slice(0, 10)

  // Prefill the invoice title with the project label or name so the user
  // doesn't have to retype it on the draft.
  const title = (project.label || project.name || '').slice(0, 200)

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO invoices (customer_id, project_id, number, title, issue_date, due_date) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(project.customer_id, project.id, '', title, issue, due)

  return { id: lastInsertRowid }
})
