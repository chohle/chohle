// Pending triage count for the sidebar badge — kept separate from the list
// endpoint so the nav doesn't pull every message body just to show a number.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDb()
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM inbound_triage WHERE status = 'pending'`)
    .get() as { n: number }
  return { count: row.n }
})
