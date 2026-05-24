export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return useDb()
    .prepare(
      `SELECT id, type, name, customer_number, city, payment_term_days, logo_path
       FROM customers ORDER BY name`
    )
    .all()
})
