// Upload a camt.053 statement: parse it, store + dedupe its credits, run the
// matcher, and return a summary. Thin shell over parseCamt053 +
// reconcileStatement, where the rules live and are unit-tested.

import { CamtParseError, parseCamt053 } from '~~/server/utils/camt'
import { ReconcileError, reconcileStatement } from '~~/server/utils/reconcile'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const parts = await readMultipartFormData(event)
  const file = (parts ?? []).find((p) => p.filename && p.data?.length)
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
  }

  let statement
  try {
    statement = parseCamt053(file.data.toString('utf8'))
  } catch (err) {
    if (err instanceof CamtParseError) {
      throw createError({ statusCode: 422, statusMessage: err.message })
    }
    throw err
  }

  try {
    const summary = reconcileStatement(useDb(), statement, file.filename!)
    return { ok: true, summary }
  } catch (err) {
    if (err instanceof ReconcileError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
})
