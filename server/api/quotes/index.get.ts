// Lists every quote with its rolled-up total. Same JOIN + grouped-items
// pattern as /api/invoices to avoid N+1 on the totals column.

interface ItemRow {
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  const quotes = db
    .prepare(
      `SELECT q.id, q.number, q.title, q.status, q.issue_date, q.valid_until,
              q.customer_id, c.name AS customer_name,
              q.project_id, p.name AS project_name,
              q.converted_invoice_id
       FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN projects p ON p.id = q.project_id
       ORDER BY q.issue_date DESC, q.id DESC`
    )
    .all() as Array<Record<string, unknown> & { id: number }>

  const ids = quotes.map((q) => q.id)
  const itemsByQuote = new Map<number, ItemRow[]>()
  if (ids.length) {
    const rows = db
      .prepare(
        `SELECT quote_id, quantity, unit_price_rappen, discount_percent, mwst_percent
         FROM quote_items WHERE quote_id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Array<ItemRow & { quote_id: number }>
    for (const r of rows) {
      const list = itemsByQuote.get(r.quote_id)
      if (list) list.push(r)
      else itemsByQuote.set(r.quote_id, [r])
    }
  }
  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered

  return quotes.map((q) => {
    const items = itemsByQuote.get(q.id) ?? []
    const { totalRappen } = computeInvoiceTotals(
      items.map((i) => ({
        quantity: i.quantity,
        unitPriceRappen: i.unit_price_rappen,
        discountPercent: i.discount_percent,
        mwstPercent: i.mwst_percent
      })),
      vat
    )
    return { ...q, total_rappen: totalRappen }
  })
})
