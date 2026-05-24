export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const c = parseCustomer(await readBody(event))
  const placeholders = CUSTOMER_COLUMNS.map(() => '?').join(', ')
  const { lastInsertRowid } = useDb()
    .prepare(`INSERT INTO customers (${CUSTOMER_COLUMNS.join(', ')}) VALUES (${placeholders})`)
    .run(...customerValues(c))

  return { id: lastInsertRowid }
})