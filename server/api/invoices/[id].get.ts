interface ItemRow {
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as { project_id: number | null } | undefined
  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  // Resolve the linked project (if any) so the UI can show "From project X"
  // and let the user jump back to the project hub. Coalesce a missing row
  // (broken link) to null so the response shape stays predictable.
  const project = invoice.project_id
    ? (db.prepare(
        `SELECT id, name, direction FROM projects WHERE id = ?`
      ).get(invoice.project_id) as { id: number, name: string, direction: 'sales' | 'procurement' } | undefined) ?? null
    : null

  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id')
    .all(id) as ItemRow[]

  const vat = !!(db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
    | { vat_registered: number }
    | undefined)?.vat_registered

  const totals = computeInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })),
    vat
  )

  return { invoice, items, totals, project }
})