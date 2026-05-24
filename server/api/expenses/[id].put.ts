export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const e = parseExpense(await readBody(event))
  const { changes } = useDb()
    .prepare(
      `UPDATE expenses
       SET title = ?, amount_rappen = ?, currency = ?, date = ?, category_id = ?, vendor = ?, notes = ?
       WHERE id = ?`
    )
    .run(e.title, e.amountRappen, e.currency, e.date, e.categoryId, e.vendor, e.notes, id)

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})