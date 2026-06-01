export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  // quote_items + invoice_reminders are wiped by ON DELETE CASCADE.
  // converted_invoice_id is ON DELETE SET NULL the other way (invoice
  // delete nulls our pointer); deleting the quote here has no side
  // effect on the linked invoice.
  const info = useDb().prepare('DELETE FROM quotes WHERE id = ?').run(id)
  if (info.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return { ok: true }
})
