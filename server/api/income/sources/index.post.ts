export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const s = parseIncomeSource(await readBody(event))
  const { lastInsertRowid } = useDb()
    .prepare(
      `INSERT INTO income_sources
         (company, job_title, salary_rappen, currency, payout_day, canton, payout_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(s.company, s.jobTitle, s.salaryRappen, s.currency, s.payoutDay, s.canton, s.payoutRule)

  return { id: lastInsertRowid }
})
