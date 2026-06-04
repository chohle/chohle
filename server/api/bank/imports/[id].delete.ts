// Delete an import and its transactions (FK cascade). Blocked by the helper
// while any transaction is a confirmed match, so paid invoices are never
// orphaned.

import { ReconcileError, deleteImport } from '~~/server/utils/reconcile'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  try {
    deleteImport(useDb(), id)
    return { ok: true }
  } catch (err) {
    if (err instanceof ReconcileError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
