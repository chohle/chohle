// Background bank-statement sync.
//
// Runs once per hour during a wall-clock morning window — by default 06:00 to
// 13:00 Europe/Zurich — walking every active bank connection, pulling new
// camt.053 statements via its provider, and handing each to the same
// reconcileStatement the manual upload uses. So a payment that lands overnight
// is auto-matched and the invoice marked paid by the first run of the day, with
// no manual upload.
//
// Why a window, not a fixed interval: banks post statements in the morning, and
// there's no point hammering the provider (or an SFTP mount) around the clock.
// Why Europe/Zurich and not server-local: the prod container runs UTC, so a
// naive "6" would mean 06:00 UTC (08:00 CEST) — we want the user's local hours.
//
// Resilience: we tick every 10 minutes and run at most once per (date, hour)
// bucket, so a missed top-of-hour tick (e.g. the unref'd timer not firing while
// the host slept) still triggers the sync when the next tick lands in-window.
//
// Mirrors 03.mail-sync.ts: single run at a time, gated on CHOHLE_SECRET (the
// connection config is encrypted), timer unref'd for clean shutdown.

import { secretIsAvailable } from '~~/server/utils/secrets'
import { runBankSync } from '~~/server/utils/bankSync'

function clampHour(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

// Inclusive window [START, END] and the zone the hours are interpreted in.
// All overridable via env.
const TZ = process.env.CHOHLE_BANK_SYNC_TZ || 'Europe/Zurich'
const START_HOUR = clampHour(process.env.CHOHLE_BANK_SYNC_START_HOUR, 6)
const END_HOUR = clampHour(process.env.CHOHLE_BANK_SYNC_END_HOUR, 13)

const TICK_MS = 10 * 60 * 1000 // re-check every 10 min
const FIRST_RUN_DELAY_MS = 60 * 1000 // let the app hydrate before the first check

let runningPromise: Promise<void> | null = null
// Last (date, hour) bucket we ran for — guarantees at most one run per hour.
let lastRunBucket: string | null = null

// Current hour (0–23) and a per-hour bucket key ("2026-06-05T07"), both in TZ —
// independent of the container's own timezone.
function hourInTz(tz: string): { hour: number; bucket: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit'
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    hour: Number(get('hour')),
    bucket: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`
  }
}

async function runOnce(): Promise<void> {
  if (runningPromise) return runningPromise
  if (!secretIsAvailable()) return
  runningPromise = (async () => {
    try {
      await runBankSync(useDb())
    } catch (err) {
      console.error('[bank-sync] run aborted:', (err as { message?: string }).message ?? err)
    } finally {
      runningPromise = null
    }
  })()
  return runningPromise
}

// Run iff we're inside the window and haven't already run this hour.
async function tick(): Promise<void> {
  const { hour, bucket } = hourInTz(TZ)
  if (hour < START_HOUR || hour > END_HOUR) return
  if (bucket === lastRunBucket) return
  lastRunBucket = bucket
  await runOnce()
}

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV === 'test') return

  console.log(`[bank-sync] hourly window ${START_HOUR}:00–${END_HOUR}:00 ${TZ}`)
  const timer = setInterval(() => {
    void tick()
  }, TICK_MS)
  ;(timer as { unref?: () => void }).unref?.()

  // A check shortly after boot catches up the current hour if we (re)start
  // mid-window.
  setTimeout(() => {
    void tick()
  }, FIRST_RUN_DELAY_MS)
})
