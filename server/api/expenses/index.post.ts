export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const title = (body?.title ?? '').trim()
  const amount = Number(body?.amount)
  const date = body?.date
  const currency = ((body?.currency ?? 'CHF') as string).trim() || 'CHF'
  const categoryId = body?.categoryId ? Number(body.categoryId) : null
  const vendor = (body?.vendor ?? '').trim() || null
  const notes = (body?.notes ?? '').trim() || null

  if (
    !title ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid expense' })
  }

  const amountRappen = Math.round(amount * 100)
  const { lastInsertRowid } = useDb()
    .prepare(
      `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, amountRappen, currency, date, categoryId, vendor, notes)

  return { id: lastInsertRowid }
})