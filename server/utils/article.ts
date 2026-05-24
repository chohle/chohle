export interface ArticleInput {
  name: string
  unit: string
  priceRappen: number
  mwst: number
}

export function parseArticle(body: Record<string, unknown>): ArticleInput {
  const name = String(body?.name ?? '').trim()
  const unit = String(body?.unit ?? '').trim()
  const price = Number(body?.price)
  const mwst = Number(body?.mwst)

  if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(mwst) || mwst < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid article' })
  }

  return { name, unit, priceRappen: Math.round(price * 100), mwst }
}
