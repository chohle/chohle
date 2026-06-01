// Save all three Mahnung level templates + wait days in one round
// trip. The Mahnungen settings tab edits them as a single form so we
// take them as a single body to keep the UI's save button atomic.

interface Body {
  level1?: { wait_days?: number; subject?: string; body?: string }
  level2?: { wait_days?: number; subject?: string; body?: string }
  level3?: { wait_days?: number; subject?: string; body?: string }
}

function clampDays(n: unknown, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0 || v > 365) return fallback
  return Math.round(v)
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const body = await readBody<Body>(event)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Body required' })

  const db = useDb()
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()

  const current = db
    .prepare(
      `SELECT reminder1_wait_days, reminder1_subject, reminder1_body,
              reminder2_wait_days, reminder2_subject, reminder2_body,
              reminder3_wait_days, reminder3_subject, reminder3_body
       FROM sender WHERE id = 1`
    )
    .get() as {
    reminder1_wait_days: number
    reminder1_subject: string
    reminder1_body: string
    reminder2_wait_days: number
    reminder2_subject: string
    reminder2_body: string
    reminder3_wait_days: number
    reminder3_subject: string
    reminder3_body: string
  }

  db.prepare(
    `UPDATE sender SET
      reminder1_wait_days = ?, reminder1_subject = ?, reminder1_body = ?,
      reminder2_wait_days = ?, reminder2_subject = ?, reminder2_body = ?,
      reminder3_wait_days = ?, reminder3_subject = ?, reminder3_body = ?
     WHERE id = 1`
  ).run(
    clampDays(body.level1?.wait_days, current.reminder1_wait_days),
    asString(body.level1?.subject, current.reminder1_subject),
    asString(body.level1?.body, current.reminder1_body),
    clampDays(body.level2?.wait_days, current.reminder2_wait_days),
    asString(body.level2?.subject, current.reminder2_subject),
    asString(body.level2?.body, current.reminder2_body),
    clampDays(body.level3?.wait_days, current.reminder3_wait_days),
    asString(body.level3?.subject, current.reminder3_subject),
    asString(body.level3?.body, current.reminder3_body)
  )
  return { ok: true }
})
