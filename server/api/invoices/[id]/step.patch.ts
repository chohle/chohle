export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const b = await readBody(event)
  const step = Number(b?.step)
  if (![0, 1, 2].includes(step)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid step' })
  }

  const res = useDb().prepare('UPDATE invoices SET step = ? WHERE id = ?').run(step, id)
  if (res.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  return { ok: true }
})
