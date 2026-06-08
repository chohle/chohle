// JSON preview for the tax-export page: totals, receipt coverage and VAT for a
// year, plus the list of years that have data.
import { buildTaxReport, taxReportYears } from '~~/server/utils/taxReport'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDb()
  const years = taxReportYears(db)
  const q = Number(getQuery(event).year)
  const year =
    Number.isInteger(q) && q >= 2000 && q <= 2100 ? q : (years[0] ?? new Date().getFullYear())

  const r = buildTaxReport(db, year)
  const receiptCount = r.expenses.journal.reduce((n, j) => n + j.attachments.length, 0)

  return {
    years,
    year,
    income: {
      invoiceRappen: r.income.invoiceRappen,
      salaryRappen: r.income.salaryRappen,
      totalRappen: r.income.totalRappen
    },
    expenseRappen: r.expenses.totalRappen,
    netRappen: r.netRappen,
    expenseCount: r.expenses.journal.length,
    receiptCount,
    missingReceipts: r.missingReceipts.length,
    byCategory: r.expenses.byCategory,
    vat: r.vat
  }
})
