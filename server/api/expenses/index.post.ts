export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const e = parseExpense(await readBody(event))
  const { lastInsertRowid } = useDb()
    .prepare(
      `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(e.title, e.amountRappen, e.currency, e.date, e.categoryId, e.vendor, e.notes)

  return { id: lastInsertRowid }
})