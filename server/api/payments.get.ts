interface PaymentRow {
  kind: 'invoice' | 'salary'
  id: number
  date: string
  amount_rappen: number
  label: string
  sub_label: string
  link?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const q = getQuery(event).year
  const year = typeof q === 'string' && /^\d{4}$/.test(q) ? q : String(new Date().getFullYear())

  const db = useDb()

  const invoiceRows = db
    .prepare(
      `SELECT i.id, i.number, i.title, substr(i.paid_at, 1, 10) AS date,
              i.total_rappen, c.name AS customer_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.status = 'paid' AND substr(i.paid_at, 1, 4) = ?`
    )
    .all(year) as Array<{
    id: number
    number: string | null
    title: string | null
    date: string
    total_rappen: number
    customer_name: string
  }>

  const salaryRows = db
    .prepare(
      `SELECT p.id, p.date, p.amount_rappen, p.month, s.company
       FROM income_payments p
       JOIN income_sources s ON s.id = p.source_id
       WHERE substr(p.date, 1, 4) = ?`
    )
    .all(year) as Array<{
    id: number
    date: string
    amount_rappen: number
    month: string
    company: string
  }>

  const rows: PaymentRow[] = [
    ...invoiceRows.map<PaymentRow>((r) => ({
      kind: 'invoice',
      id: r.id,
      date: r.date,
      amount_rappen: r.total_rappen,
      label: r.number || r.title || '',
      sub_label: r.customer_name,
      link: `/invoices/${r.id}`
    })),
    ...salaryRows.map<PaymentRow>((r) => ({
      kind: 'salary',
      id: r.id,
      date: r.date,
      amount_rappen: r.amount_rappen,
      label: r.company,
      sub_label: r.month
    }))
  ].sort((a, b) => b.date.localeCompare(a.date))

  const total = rows.reduce((s, r) => s + r.amount_rappen, 0)

  return { year: Number(year), rows, total }
})
