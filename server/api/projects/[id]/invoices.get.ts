// Invoices that belong to this project, with computed totals so the project
// detail page can show a budget burn.

interface InvoiceRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  due_date: string
}

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
  const invoices = db
    .prepare(
      `SELECT id, number, title, status, issue_date, due_date
       FROM invoices WHERE project_id = ? ORDER BY issue_date DESC, id DESC`
    )
    .all(id) as InvoiceRow[]

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
