export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return useDb()
    .prepare(
      `SELECT id, company, job_title, salary_rappen, currency, payout_day, canton, payout_rule
       FROM income_sources ORDER BY company`
    )
    .all()
})