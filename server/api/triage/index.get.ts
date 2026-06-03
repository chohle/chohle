// Pending inbound-triage queue: synced inbound that didn't thread to any
// project, awaiting a human to assign or dismiss it. Joins in the suggested
// customer/project names so the UI can render the suggestion chip directly.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDb()

  const rows = db
    .prepare(
      `SELECT t.id, t.message_id, t.from_address, t.to_address, t.subject,
              t.body_html, t.body_text, t.sent_at, t.created_at,
              t.suggested_customer_id, t.suggested_project_id,
              c.name AS suggested_customer_name,
              p.name AS suggested_project_name,
              p.direction AS suggested_project_direction
       FROM inbound_triage t
       LEFT JOIN customers c ON c.id = t.suggested_customer_id
       LEFT JOIN projects p ON p.id = t.suggested_project_id
       WHERE t.status = 'pending'
       ORDER BY t.sent_at DESC, t.id DESC`
    )
    .all()

  return { rows, count: rows.length }
})
