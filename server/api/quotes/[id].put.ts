// Update a draft/sent quote: number, title, status, dates, project_id,
// and full line items rewrite (DELETE + INSERT inside a transaction).
//
// Status transitions are mostly free-form here so the editor can
// downgrade a 'sent' back to 'draft' for corrections. The dedicated
// /accept and /decline endpoints stamp accepted_at / declined_at for
// the workflow buttons; that timestamp survives a PUT.

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const db = useDb()
  const current = db.prepare('SELECT project_id, customer_id FROM quotes WHERE id = ?').get(id) as
    | { project_id: number | null; customer_id: number }
    | undefined
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const b = await readBody(event)
  const number = String(b?.number ?? '').trim()
  const title = String(b?.title ?? '').trim()
  const status = ['draft', 'sent', 'accepted', 'declined'].includes(b?.status) ? b.status : 'draft'
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(b?.issueDate) ? b.issueDate : null
  const validUntil =
    b?.validUntil == null || b.validUntil === ''
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(b.validUntil)
        ? b.validUntil
        : null
  if (!issueDate) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid issue date' })
  }

  // project_id stays nullable. Accept explicit null to unlink, undefined
  // to keep the current value, a number to relink. Validated to exist
  // AND to belong to the quote's customer so the UI's customer-scoped
  // picker can't be bypassed by a crafted body.
  let projectId = current.project_id
  if (b?.projectId === null) {
    projectId = null
  } else if (b?.projectId !== undefined) {
    const next = Number(b.projectId)
    if (!Number.isInteger(next)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid projectId' })
    }
    const project = db.prepare('SELECT customer_id FROM projects WHERE id = ?').get(next) as
      | { customer_id: number | null }
      | undefined
    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }
    if (project.customer_id !== current.customer_id) {
      throw createError({
        statusCode: 422,
        statusMessage: "Project does not belong to the quote's customer"
      })
    }
    projectId = next
  }

  const items = Array.isArray(b?.items) ? b.items : []
  const insert = db.prepare(
    `INSERT INTO quote_items
       (quote_id, article_id, description, quantity, unit, unit_price_rappen,
        discount_percent, mwst_percent, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const vat = !!(
    db.prepare('SELECT vat_registered FROM sender WHERE id = 1').get() as
      | { vat_registered: number }
      | undefined
  )?.vat_registered
  const { totalRappen } = computeInvoiceTotals(
    items.map((it: Record<string, unknown>) => ({
      quantity: Number(it?.quantity) || 0,
      unitPriceRappen: Math.round((Number(it?.unitPrice) || 0) * 100),
      discountPercent: Number(it?.discountPercent) || 0,
      mwstPercent: Number(it?.mwstPercent) || 0
    })),
    vat
  )

  db.transaction(() => {
    db.prepare(
      `UPDATE quotes SET number = ?, title = ?, status = ?, issue_date = ?,
        valid_until = ?, project_id = ?, total_rappen = ? WHERE id = ?`
    ).run(number, title, status, issueDate, validUntil, projectId, totalRappen, id)

    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id)
    items.forEach((it: Record<string, unknown>, index: number) => {
      insert.run(
        id,
        normalizeArticleId(it?.articleId),
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
