// Thin shell around convertQuoteToInvoice. The conversion rules
// (already-converted / declined / no-project) live in the helper so
// vitest can assert them without booting Nitro.

import { QuoteConvertError, convertQuoteToInvoice } from '~~/server/utils/quotes'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }

  try {
    return { ok: true, ...convertQuoteToInvoice(useDb(), id) }
  } catch (err) {
    if (err instanceof QuoteConvertError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
