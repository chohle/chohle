export interface ExpenseInput {
  title: string
  amountRappen: number
  currency: string
  date: string
  categoryId: number | null
  vendor: string | null
  notes: string | null
  vatRate: number
}

export function parseExpense(body: Record<string, unknown>): ExpenseInput {
  const title = String(body?.title ?? '').trim()
  const amount = Number(body?.amount)
  const date = body?.date
  const currency = String(body?.currency ?? 'CHF').trim() || 'CHF'
  const categoryId = body?.categoryId ? Number(body.categoryId) : null
  const vendor = String(body?.vendor ?? '').trim() || null
  const notes = String(body?.notes ?? '').trim() || null
  // Optional VAT rate (%) for the tax export's input-VAT figure; 0 when unset.
  const rate = Number(body?.vatRate)
  const vatRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0

  if (
    !title ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid expense' })
  }

  return {
    title,
    amountRappen: Math.round(amount * 100),
    currency,
    date: String(date),
    categoryId,
    vendor,
    notes,
    vatRate
  }
}
