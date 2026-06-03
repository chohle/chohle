// List all email signatures, default first then by name.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const rows = useDb()
    .prepare(
      `SELECT id, name, content_html, is_default, created_at
       FROM signatures ORDER BY is_default DESC, name COLLATE NOCASE`
    )
    .all()
  return { rows }
})
