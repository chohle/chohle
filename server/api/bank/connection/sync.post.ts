// Trigger a sync now instead of waiting for the nightly job. Returns the
// per-run result (counts + any errors); syncConnection also stamps the
// outcome on the connection row.

import { getConnection, providerFor, syncConnection } from '~~/server/utils/bankSync'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const db = useDb()
  const conn = getConnection(db)
  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'No bank connection configured' })
  }
  const provider = providerFor(conn.provider)
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider' })
  }

  const result = await syncConnection(db, conn, provider)
  return { ok: result.errors.length === 0, result }
})
