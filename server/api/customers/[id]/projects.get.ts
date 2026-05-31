// Projects (sales + procurement) linked to this customer, with rolled up
// invoice totals so the customer detail page can show budget context at a
// glance: how much each project is budgeted for and how much has actually
// been invoiced and paid against it.

interface ProjectRow {
  id: number
  name: string
  direction: 'sales' | 'procurement'
  stage: string
  label: string
  budget_rappen: number
  budget_type: string
  due_date: string | null
  updated_at: string
  email_count: number
  invoice_count: number
  invoiced_rappen: number
  paid_rappen: number
}

interface ItemRow {
  invoice_id: number
  status: 'draft' | 'sent' | 'paid'
  quantity: number
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
  project_id: number
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const projects = db
    .prepare(
      `SELECT p.id, p.name, p.direction, p.stage, p.label, p.budget_rappen, p.budget_type,
              p.due_date, p.updated_at,
              (SELECT COUNT(*) FROM project_emails pe WHERE pe.project_id = p.id) AS email_count
       FROM projects p
       WHERE p.customer_id = ?
       ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all(id) as Array<Omit<ProjectRow, 'invoice_count' | 'invoiced_rappen' | 'paid_rappen'>>

  if (!projects.length) return []

  // One pass over every line item across all this customer's project invoices.
  // Avoids N invoice queries when the customer has many projects.
  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered

  const ids = projects.map((p) => p.id)
  // Drive from `invoices` (LEFT JOIN items) so invoices with zero line
  // items still count toward invoice_count, even though they contribute
  // 0 to the totals.
  const invoiceRows = db
    .prepare(
      `SELECT i.id, i.status, i.project_id
       FROM invoices i
       WHERE i.project_id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids) as Array<{ id: number; status: 'draft' | 'sent' | 'paid'; project_id: number }>

  const items = invoiceRows.length
    ? (db
        .prepare(
          `SELECT ii.invoice_id, ii.quantity, ii.unit_price_rappen,
                ii.discount_percent, ii.mwst_percent
         FROM invoice_items ii
         WHERE ii.invoice_id IN (${invoiceRows.map(() => '?').join(',')})`
        )
        .all(...invoiceRows.map((r) => r.id)) as Array<
        Omit<ItemRow, 'invoice_id' | 'status' | 'project_id'> & { invoice_id: number }
      >)
    : []

  const itemsByInvoice = new Map<number, typeof items>()
  for (const r of items) {
    const list = itemsByInvoice.get(r.invoice_id)
    if (list) list.push(r)
    else itemsByInvoice.set(r.invoice_id, [r])
  }

  const stats = new Map<number, { count: number; invoiced: number; paid: number }>()
  for (const inv of invoiceRows) {
    const rows = itemsByInvoice.get(inv.id) ?? []
    const { totalRappen } = computeInvoiceTotals(
      rows.map((r) => ({
        quantity: r.quantity,
        unitPriceRappen: r.unit_price_rappen,
        discountPercent: r.discount_percent,
        mwstPercent: r.mwst_percent
      })),
      vat
    )
    const s = stats.get(inv.project_id) ?? { count: 0, invoiced: 0, paid: 0 }
    s.count += 1
    s.invoiced += totalRappen
    if (inv.status === 'paid') s.paid += totalRappen
    stats.set(inv.project_id, s)
  }

  return projects.map((p) => ({
    ...p,
    invoice_count: stats.get(p.id)?.count ?? 0,
    invoiced_rappen: stats.get(p.id)?.invoiced ?? 0,
    paid_rappen: stats.get(p.id)?.paid ?? 0
  }))
})
