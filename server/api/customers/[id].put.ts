export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const c = parseCustomer(await readBody(event))
  const assignments = CUSTOMER_COLUMNS.map((col) => `${col} = ?`).join(', ')
  const { changes } = useDb()
    .prepare(`UPDATE customers SET ${assignments} WHERE id = ?`)
    .run(...customerValues(c), id)

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})
