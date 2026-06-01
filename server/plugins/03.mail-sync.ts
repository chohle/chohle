// Background mail sync.
//
// Every CHOHLE_MAIL_SYNC_INTERVAL_MS (default 5 minutes) we walk every
// connected mailbox and pull inbound replies via its provider driver
// (Outlook + Gmail + generic IMAP). The first run fires 30s after boot
// so the app finishes hydrating before we start hammering external
// APIs.

import { secretIsAvailable } from '~~/server/utils/secrets'
import {
  listOutlookMailboxes,
  recordSyncError,
  syncOutlookMailbox
} from '~~/server/utils/outlookSync'
import { listGmailMailboxes, syncGmailMailbox } from '~~/server/utils/gmailSync'
import { listImapMailboxes, syncImapMailbox } from '~~/server/utils/imapSync'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

// One run at a time. If a previous tick is still going (slow API,
// pagination, many mailboxes) the next interval just skips. Prevents
// double-refreshing the same access token, which Microsoft would treat
// as suspicious and might invalidate.
let runningPromise: Promise<void> | null = null

async function runOnce(): Promise<void> {
  if (runningPromise) return runningPromise
  // Guard before claiming the lock so a missing CHOHLE_SECRET doesn't
  // leave a resolved promise stuck in runningPromise forever (the IIFE's
  // finally only fires when we enter the try below).
  if (!secretIsAvailable()) return
  runningPromise = (async () => {
    try {
      const db = useDb()
      for (const mailbox of listOutlookMailboxes(db)) {
        try {
          const r = await syncOutlookMailbox(db, mailbox)
          if (r.inserted > 0) {
            console.log(
              `[mail-sync] outlook ${mailbox.id}: +${r.inserted} new (scanned ${r.scanned})`
            )
          }
        } catch (err) {
          const msg = (err as { message?: string }).message ?? String(err)
          recordSyncError(db, mailbox.id, msg)
          console.warn(`[mail-sync] outlook ${mailbox.id} failed:`, msg)
        }
      }
      for (const mailbox of listGmailMailboxes(db)) {
        try {
          const r = await syncGmailMailbox(db, mailbox)
          if (r.inserted > 0) {
            console.log(
              `[mail-sync] gmail ${mailbox.id}: +${r.inserted} new (scanned ${r.scanned})`
            )
          }
        } catch (err) {
          const msg = (err as { message?: string }).message ?? String(err)
          recordSyncError(db, mailbox.id, msg)
          console.warn(`[mail-sync] gmail ${mailbox.id} failed:`, msg)
        }
      }
      for (const mailbox of listImapMailboxes(db)) {
        try {
          const r = await syncImapMailbox(db, mailbox)
          if (r.inserted > 0) {
            console.log(`[mail-sync] imap ${mailbox.id}: +${r.inserted} new (scanned ${r.scanned})`)
          }
        } catch (err) {
          const msg = (err as { message?: string }).message ?? String(err)
          recordSyncError(db, mailbox.id, msg)
          console.warn(`[mail-sync] imap ${mailbox.id} failed:`, msg)
        }
      }
    } catch (err) {
      // Surface infra failures (DB unavailable, list query throws, ...)
      // so we don't keep silently misfiring every 5 minutes.
      console.error('[mail-sync] run aborted:', (err as { message?: string }).message ?? err)
    } finally {
      runningPromise = null
    }
  })()
  return runningPromise
}

export default defineNitroPlugin(() => {
  const interval = Number(process.env.CHOHLE_MAIL_SYNC_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  // Skip in test runs and in build output where we have no DB.
  if (process.env.NODE_ENV === 'test') return

  // setInterval keeps the event loop alive across the process lifetime.
  // `.unref()` so the timer doesn't block a graceful shutdown if the
  // host is stopping (Docker SIGTERM, dev HMR reload, etc.).
  const timer = setInterval(() => {
    void runOnce()
  }, interval)
  ;(timer as { unref?: () => void }).unref?.()

  setTimeout(() => {
    void runOnce()
  }, FIRST_RUN_DELAY_MS)
})
