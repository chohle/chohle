interface ItemRow {
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  const invoices = db
    .prepare(
      `SELECT i.id, i.number, i.title, i.status, i.issue_date, i.due_date,
              i.customer_id, c.name AS customer_name,
              i.project_id, p.name AS project_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN projects p ON p.id = i.project_id
       ORDER BY i.issue_date DESC, i.id DESC`
    )
    .all() as Array<Record<string, unknown> & { id: number }>

  // Fetch all line items in one query, grouped by invoice (avoids N+1).
  const ids = invoices.map((i) => i.id)
  const itemsByInvoice = new Map<number, ItemRow[]>()
  if (ids.length) {
    const rows = db
      .prepare(
        `SELECT invoice_id, quantity, unit_price_rappen, discount_percent, mwst_percent
         FROM invoice_items WHERE invoice_id IN (${ids.map(() => '?').join(',')})`
      )
      .all(...ids) as Array<ItemRow & { invoice_id: number }>
    for (const r of rows) {
      const list = itemsByInvoice.get(r.invoice_id)
      if (list) list.push(r)
      else itemsByInvoice.set(r.invoice_id, [r])
    }
  }
  const vat = !!(db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
    | { vat_registered: number }
    | undefined)?.vat_registered

  return invoices.map((inv) => {
    const items = itemsByInvoice.get(inv.id) ?? []
    const { totalRappen } = computeInvoiceTotals(
      items.map((i) => ({
        quantity: i.quantity,
        unitPriceRappen: i.unit_price_rappen,
        discountPercent: i.discount_percent,
        mwstPercent: i.mwst_percent
      })),
      vat
    )
    return { ...inv, total_rappen: totalRappen }
  })
})
