// Ignore a transaction (bank fee, non-invoice income, etc.) so it drops out of
// the review queue without touching any invoice.

import { ReconcileError, ignoreTransaction } from '~~/server/utils/reconcile'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  try {
    ignoreTransaction(useDb(), id)
    return { ok: true }
  } catch (err) {
    if (err instanceof ReconcileError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
