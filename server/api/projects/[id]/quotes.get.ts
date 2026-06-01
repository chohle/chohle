// Quotes that belong to this project, with computed totals so the
// project detail page can show them alongside its invoices. Same
// shape as projects/[id]/invoices.get.ts.

interface QuoteRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  issue_date: string
  valid_until: string | null
  converted_invoice_id: number | null
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
  const quotes = db
    .prepare(
      `SELECT id, number, title, status, issue_date, valid_until, converted_invoice_id
       FROM quotes WHERE project_id = ? ORDER BY issue_date DESC, id DESC`
    )
    .all(id) as QuoteRow[]

  const itemsStmt = db.prepare(
    'SELECT quantity, unit_price_rappen, discount_percent, mwst_percent FROM quote_items WHERE quote_id = ?'
  )
  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered

  return quotes.map((q) => {
    const items = itemsStmt.all(q.id) as ItemRow[]
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
