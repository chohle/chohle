// Returns connected mailboxes for the Settings list. Strips token and
// IMAP password columns; only metadata + status is exposed.

import type { MailboxRow } from '~~/server/utils/mailbox'
import { toMailboxResponse } from '~~/server/utils/mailbox'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const rows = useDb().prepare(
    `SELECT id, provider, label, email_address, token_expires_at,
            last_sync_at, last_error, created_at
     FROM mailboxes ORDER BY created_at DESC, id DESC`
  ).all() as MailboxRow[]
  return rows.map(toMailboxResponse)
})
