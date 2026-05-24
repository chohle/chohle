export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const s = parseIncomeSource(await readBody(event))
  const { changes } = useDb()
    .prepare(
      `UPDATE income_sources
       SET company = ?, job_title = ?, salary_rappen = ?, currency = ?,
           payout_day = ?, canton = ?, payout_rule = ?
       WHERE id = ?`
    )
    .run(s.company, s.jobTitle, s.salaryRappen, s.currency, s.payoutDay, s.canton, s.payoutRule, id)

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})
