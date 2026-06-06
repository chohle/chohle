// Import history, newest first, with how many of each import's transactions are
// confirmed matches (so the UI can warn before a delete is blocked).

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  const rows = db
    .prepare(
      `SELECT b.id, b.filename, b.iban, b.statement_id, b.from_date, b.to_date, b.tx_count, b.created_at,
              (SELECT COUNT(*) FROM bank_transactions t
               WHERE t.import_id = b.id AND t.status = 'matched') AS matched_count
       FROM bank_imports b
       ORDER BY b.id DESC`
    )
    .all()

  return { imports: rows }
})
