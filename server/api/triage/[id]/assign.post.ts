// Assign a triage item to a project. Moves the message — and the rest of its
// conversation (same sender + normalized subject still pending) — into
// project_emails, then tombstones the triage rows as 'assigned'. Once in
// project_emails their Message-IDs become thread anchors, so future replies
// match automatically. This is the only path that files triaged mail, and it
// is always an explicit, human-confirmed action.

interface Body {
  project_id?: number
}

interface TriageRow {
  id: number
  message_id: string | null
  from_address: string | null
  to_address: string | null
  subject: string
  body_html: string
  body_text: string
  sent_at: string | null
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const body = await readBody<Body>(event)
  const projectId = Number(body.project_id)
  if (!Number.isFinite(projectId)) {
    throw createError({ statusCode: 400, statusMessage: 'project_id required' })
  }

  const db = useDb()
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project not found' })
  }

  const cols = `id, message_id, from_address, to_address, subject, body_html, body_text, sent_at`
  const row = db
    .prepare(`SELECT ${cols} FROM inbound_triage WHERE id = ? AND status = 'pending'`)
    .get(id) as TriageRow | undefined
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'triage item not found or already handled'
    })
  }

  // Group the whole back-and-forth from this sender. Only group when we have a
  // real sender to key on — otherwise assign just the chosen message so a pile
  // of unrelated unknown-sender mail isn't swept in together.
  let thread: TriageRow[] = [row]
  if (row.from_address) {
    const base = stripReplyPrefix(row.subject)
    const siblings = db
      .prepare(`SELECT ${cols} FROM inbound_triage WHERE status = 'pending' AND from_address = ?`)
      .all(row.from_address) as TriageRow[]
    thread = siblings.filter((s) => stripReplyPrefix(s.subject) === base)
    if (!thread.some((s) => s.id === row.id)) thread.push(row)
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO project_emails (project_id, direction, from_address, to_address,
                                 subject, body_html, body_text, sent_at, message_id)
     VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, ?)`
  )
  const markAssigned = db.prepare(`UPDATE inbound_triage SET status = 'assigned' WHERE id = ?`)

  const assign = db.transaction((items: TriageRow[]) => {
    let moved = 0
    for (const it of items) {
      const sentAt = it.sent_at ?? new Date().toISOString().replace('T', ' ').slice(0, 19)
      insert.run(
        projectId,
        it.from_address,
        it.to_address,
        it.subject,
        it.body_html,
        it.body_text,
        sentAt,
        it.message_id
      )
      markAssigned.run(it.id)
      moved += 1
    }
    return moved
  })

  const moved = assign(thread)
  return { project_id: projectId, moved }
})
