interface ProjectEmailRow {
  id: number
  project_id: number
  direction: 'outbound' | 'inbound'
  from_address: string | null
  to_address: string | null
  subject: string
  body_html: string
  body_text: string
  sent_at: string
  created_at: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const exists = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id)
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'project not found' })
  }

  const rows = db
    .prepare(
      `SELECT id, project_id, direction, from_address, to_address, subject,
            body_html, body_text, sent_at, created_at
     FROM project_emails
     WHERE project_id = ?
     ORDER BY sent_at ASC, id ASC`
    )
    .all(id) as ProjectEmailRow[]

  return { rows }
})
