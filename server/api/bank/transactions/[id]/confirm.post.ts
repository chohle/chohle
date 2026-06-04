// Confirm a transaction against an invoice: marks the invoice paid (booking
// date) and links the transaction. Accepts a suggestion or pairs an unmatched
// transaction by hand; { invoice_id } overrides whatever was suggested.

import { ReconcileError, confirmTransaction } from '~~/server/utils/reconcile'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  const body = await readBody(event)
  const invoiceId = Number(body?.invoice_id ?? body?.invoiceId)
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invoice_id is required' })
  }

  try {
    return { ok: true, ...confirmTransaction(useDb(), id, invoiceId) }
  } catch (err) {
    if (err instanceof ReconcileError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
