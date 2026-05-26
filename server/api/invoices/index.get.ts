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
              i.customer_id, c.name AS customer_name
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       ORDER BY i.issue_date DESC, i.id DESC`
    )
    .all() as Array<Record<string, unknown> & { id: number }>

  const itemsStmt = db.prepare(
    'SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?'
  )
  const vat = !!(db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
    | { vat_registered: number }
    | undefined)?.vat_registered

  return invoices.map((inv) => {
    const items = itemsStmt.all(inv.id) as ItemRow[]
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
