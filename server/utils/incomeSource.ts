export const CANTONS = [
  'ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL',
  'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'VD', 'VS', 'NE', 'GE', 'JU'
]

const RULES = ['earlier', 'later', 'none']

export interface IncomeSourceInput {
  company: string
  jobTitle: string | null
  salaryRappen: number
  currency: string
  payoutDay: number
  canton: string
  payoutRule: string
}

export function parseIncomeSource(body: Record<string, unknown>): IncomeSourceInput {
  const company = String(body?.company ?? '').trim()
  const jobTitle = String(body?.jobTitle ?? '').trim() || null
  const salary = Number(body?.salary)
  const currency = String(body?.currency ?? 'CHF').trim() || 'CHF'
  const payoutDay = Number(body?.payoutDay)
  const canton = String(body?.canton ?? '').trim().toUpperCase()
  const payoutRule = String(body?.payoutRule ?? 'earlier')

  if (
    !company ||
    !Number.isFinite(salary) ||
    salary <= 0 ||
    !Number.isInteger(payoutDay) ||
    payoutDay < 1 ||
    payoutDay > 31 ||
    !CANTONS.includes(canton) ||
    !RULES.includes(payoutRule)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid income source' })
  }

  return {
    company,
    jobTitle,
    salaryRappen: Math.round(salary * 100),
    currency,
    payoutDay,
    canton,
    payoutRule
  }
}