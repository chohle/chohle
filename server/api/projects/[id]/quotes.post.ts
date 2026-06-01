// Create a draft quote scoped to a project. Mirror of
// projects/[id]/invoices.post.ts. Pulls the customer + a sensible
// title from the project so the editor lands with something to work
// with. Valid for 30 days by default; the editor can change it.

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
      statusMessage: 'Project has no linked customer; link one before quoting'
    })
  }

  const issue = new Date().toISOString().slice(0, 10)
  const validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const title = (project.label || project.name || '').slice(0, 200)

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO quotes (customer_id, project_id, number, title, issue_date, valid_until)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(project.customer_id, project.id, '', title, issue, validUntil)

  return { id: lastInsertRowid }
})
