// Single quote + its items + rolled totals + (if linked) the project
// shell for the "From project X" backlink in the editor.

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
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as
    | { project_id: number | null; customer_id: number; converted_invoice_id: number | null }
    | undefined
  if (!quote) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const project = quote.project_id
    ? ((db
        .prepare(`SELECT id, name, direction FROM projects WHERE id = ?`)
        .get(quote.project_id) as
        | { id: number; name: string; direction: 'sales' | 'procurement' }
        | undefined) ?? null)
    : null

  const convertedInvoice = quote.converted_invoice_id
    ? ((db
        .prepare('SELECT id, number FROM invoices WHERE id = ?')
        .get(quote.converted_invoice_id) as { id: number; number: string } | undefined) ?? null)
    : null

  const items = db
    .prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position, id')
    .all(id) as ItemRow[]

  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered

  const totals = computeInvoiceTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPriceRappen: i.unit_price_rappen,
      discountPercent: i.discount_percent,
      mwstPercent: i.mwst_percent
    })),
    vat
  )

  return { quote, items, totals, project, convertedInvoice }
})
