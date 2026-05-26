// One-time backfill: freeze total_rappen for invoices that were already paid
// before the snapshot column existed. Idempotent (only fills NULLs).
export default defineNitroPlugin(() => {
  const db = useDb()
  const pending = db
    .prepare("SELECT id FROM invoices WHERE status = 'paid' AND total_rappen IS NULL")
    .all() as { id: number }[]
  if (!pending.length) return

  const vat = !!(db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
    | { vat_registered: number }
    | undefined)?.vat_registered
  const itemsStmt = db.prepare(
    'SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM invoice_items WHERE invoice_id = ?'
  )
  const update = db.prepare('UPDATE invoices SET total_rappen = ? WHERE id = ?')

  for (const { id } of pending) {
    const items = itemsStmt.all(id) as Array<{ quantity: number, unit_price_rappen: number, discount_percent: number, mwst_percent: number }>
    const { totalRappen } = computeInvoiceTotals(
      items.map((i) => ({
        quantity: i.quantity,
        unitPriceRappen: i.unit_price_rappen,
        discountPercent: i.discount_percent,
        mwstPercent: i.mwst_percent
      })),
      vat
    )
    update.run(totalRappen, id)
  }
  console.log(`[invoices] backfilled frozen total for ${pending.length} paid invoice(s)`)
})
