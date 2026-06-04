// The reconciliation review queue. Optional ?status= filter
// (unmatched|suggested|matched|ignored); joins the linked invoice + customer so
// the UI can show what each suggestion points at.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const allowed = ['unmatched', 'suggested', 'matched', 'ignored']
  const status = getQuery(event).status
  const filter = typeof status === 'string' && allowed.includes(status) ? status : null

  const db = useDb()
  const rows = db
    .prepare(
      `SELECT t.id, t.import_id, t.booking_date, t.value_date, t.amount_rappen, t.currency,
              t.reference, t.end_to_end_id, t.debtor_name, t.status, t.invoice_id,
              i.number AS invoice_number, i.status AS invoice_status, c.name AS customer_name
       FROM bank_transactions t
       LEFT JOIN invoices i ON i.id = t.invoice_id
       LEFT JOIN customers c ON c.id = i.customer_id
       ${filter ? 'WHERE t.status = ?' : ''}
       ORDER BY t.booking_date DESC, t.id DESC`
    )
    .all(...(filter ? [filter] : []))

  return { transactions: rows }
})
