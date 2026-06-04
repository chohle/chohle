// The current bank connection (single, single-tenant) with its last-sync
// status. Secret config fields are stripped by sanitizeConfig.

import { getConnection, sanitizeConfig } from '~~/server/utils/bankSync'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const conn = getConnection(useDb())
  if (!conn) return { connection: null }

  let lastSummary: unknown = null
  try {
    lastSummary = conn.last_summary ? JSON.parse(conn.last_summary) : null
  } catch {
    lastSummary = null
  }

  return {
    connection: {
      id: conn.id,
      iban: conn.iban,
      provider: conn.provider,
      status: conn.status,
      config: sanitizeConfig(conn.config),
      last_sync_at: conn.last_sync_at,
      last_status: conn.last_status,
      last_error: conn.last_error,
      last_summary: lastSummary
    }
  }
})
