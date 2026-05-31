// Manual "Sync now" trigger for a single mailbox. Same code path as the
// background plugin (server/plugins/03.mail-sync.ts), so the user can
// see the result immediately instead of waiting for the next tick.

import { syncOutlookMailbox, listOutlookMailboxes, recordSyncError } from '~~/server/utils/outlookSync'
import { syncGmailMailbox, listGmailMailboxes } from '~~/server/utils/gmailSync'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const provider = (db.prepare('SELECT provider FROM mailboxes WHERE id = ?').get(id) as { provider?: string } | undefined)?.provider
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: 'mailbox not found' })
  }

  if (provider === 'outlook') {
    const mailbox = listOutlookMailboxes(db).find(m => m.id === id)
    if (!mailbox) throw createError({ statusCode: 404, statusMessage: 'mailbox not found' })
    try {
      return { ok: true, ...(await syncOutlookMailbox(db, mailbox)) }
    } catch (err) {
      const msg = (err as { message?: string }).message ?? 'sync failed'
      recordSyncError(db, id, msg)
      throw createError({ statusCode: 502, statusMessage: msg, cause: err })
    }
  }
  if (provider === 'gmail') {
    const mailbox = listGmailMailboxes(db).find(m => m.id === id)
    if (!mailbox) throw createError({ statusCode: 404, statusMessage: 'mailbox not found' })
    try {
      return { ok: true, ...(await syncGmailMailbox(db, mailbox)) }
    } catch (err) {
      const msg = (err as { message?: string }).message ?? 'sync failed'
      recordSyncError(db, id, msg)
      throw createError({ statusCode: 502, statusMessage: msg, cause: err })
    }
  }
  throw createError({ statusCode: 400, statusMessage: `no sync driver for provider ${provider}` })
})
