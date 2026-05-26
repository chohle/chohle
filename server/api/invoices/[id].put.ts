export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  if (!db.prepare('SELECT 1 FROM invoices WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const b = await readBody(event)
  const number = String(b?.number ?? '').trim()
  const title = String(b?.title ?? '').trim()
  const status = ['draft', 'sent', 'paid'].includes(b?.status) ? b.status : 'draft'
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(b?.issueDate) ? b.issueDate : null
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(b?.dueDate) ? b.dueDate : null
  // Number is optional: invoices start blank and the owner fills it in.
  if (!issueDate || !dueDate) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid invoice' })
  }

  const items = Array.isArray(b?.items) ? b.items : []
  const insert = db.prepare(
    `INSERT INTO invoice_items
       (invoice_id, article_id, description, quantity, unit, unit_price_rappen,
        discount_percent, mwst_percent, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  // Stamp paid_at when entering 'paid' (keep the original date if already set); clear otherwise.
  const current = db.prepare('SELECT paid_at FROM invoices WHERE id = ?').get(id) as { paid_at: string | null } | undefined
  const paidAt = status === 'paid' ? (current?.paid_at || new Date().toISOString().slice(0, 10)) : null

  db.transaction(() => {
    db.prepare(
      'UPDATE invoices SET number = ?, title = ?, status = ?, issue_date = ?, due_date = ?, paid_at = ? WHERE id = ?'
    ).run(number, title, status, issueDate, dueDate, paidAt, id)

    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
    items.forEach((it: Record<string, unknown>, index: number) => {
      insert.run(
        id,
        Number.isInteger(Number(it?.articleId)) ? Number(it?.articleId) : null,
        String(it?.description ?? ''),
        Number(it?.quantity) || 0,
        String(it?.unit ?? ''),
        Math.round((Number(it?.unitPrice) || 0) * 100),
        Number(it?.discountPercent) || 0,
        Number(it?.mwstPercent) || 0,
        index
      )
    })
  })()

  return { ok: true }
})