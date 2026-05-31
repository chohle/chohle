export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const a = parseArticle(await readBody(event))
  const { lastInsertRowid } = useDb()
    .prepare(
      'INSERT INTO articles (name, unit, default_price_rappen, default_mwst) VALUES (?, ?, ?, ?)'
    )
    .run(a.name, a.unit, a.priceRappen, a.mwst)

  return { id: lastInsertRowid }
})
