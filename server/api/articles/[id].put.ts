export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const a = parseArticle(await readBody(event))
  const { changes } = useDb()
    .prepare(
      'UPDATE articles SET name = ?, unit = ?, default_price_rappen = ?, default_mwst = ? WHERE id = ?'
    )
    .run(a.name, a.unit, a.priceRappen, a.mwst, id)

  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})