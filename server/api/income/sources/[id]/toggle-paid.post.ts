interface SourceRow {
  salary_rappen: number
  payout_day: number
  canton: string
  payout_rule: 'earlier' | 'later' | 'none'
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  const { month } = await readBody(event)
  if (!Number.isInteger(id) || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request' })
  }

  const db = useDb()
  const source = db
    .prepare(
      'SELECT salary_rappen, payout_day, canton, payout_rule FROM income_sources WHERE id = ?'
    )
    .get(id) as SourceRow | undefined
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const existing = db
    .prepare('SELECT id FROM income_payments WHERE source_id = ? AND month = ?')
    .get(id, month) as { id: number } | undefined
  if (existing) {
    db.prepare('DELETE FROM income_payments WHERE id = ?').run(existing.id)
    return { paid: false }
  }

  const [year, mo] = month.split('-').map(Number) as [number, number]
  const holidays = await getHolidays(source.canton, year)
  const { date } = computePayout(year, mo, source.payout_day, source.payout_rule, holidays)
  db.prepare(
    'INSERT INTO income_payments (source_id, month, date, amount_rappen) VALUES (?, ?, ?, ?)'
  ).run(id, month, date, source.salary_rappen)

  return { paid: true, date }
})
