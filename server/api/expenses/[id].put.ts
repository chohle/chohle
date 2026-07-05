export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = requireIdParam(event)

  const e = parseExpense(await readBody(event))
  const { changes } = useDb()
    .prepare(
      `UPDATE expenses
       SET title = ?, amount_rappen = ?, currency = ?, date = ?, category_id = ?, vendor = ?, notes = ?, vat_rate = ?
       WHERE id = ?`
    )
    .run(
      e.title,
      e.amountRappen,
      e.currency,
      e.date,
      e.categoryId,
      e.vendor,
      e.notes,
      e.vatRate,
      id
    )

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})
