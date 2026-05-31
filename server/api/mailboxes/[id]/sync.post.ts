// Manual "Sync now" trigger for a single mailbox. Same code path as the
// background plugin (server/plugins/03.mail-sync.ts), so the user can
// see the result immediately instead of waiting for the next tick.

import { syncOutlookMailbox, listOutlookMailboxes, recordSyncError } from '~~/server/utils/outlookSync'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }

  const db = useDb()
  const mailbox = listOutlookMailboxes(db).find(m => m.id === id)
  if (!mailbox) {
    throw createError({ statusCode: 404, statusMessage: 'mailbox not found or not an Outlook account' })
  }

  try {
    const result = await syncOutlookMailbox(db, mailbox)
    return { ok: true, ...result }
  } catch (err) {
    const msg = (err as { statusMessage?: string; message?: string }).statusMessage
      ?? (err as { message?: string }).message
      ?? 'sync failed'
    recordSyncError(db, mailbox.id, msg)
    throw createError({ statusCode: 502, statusMessage: msg, cause: err })
  }
})
