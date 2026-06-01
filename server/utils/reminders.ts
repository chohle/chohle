// Mahnungen / overdue reminder helpers shared by the send endpoint
// (POST /api/invoices/[id]/remind) and the eligibility list
// (GET /api/reminders).

import type { Database } from 'better-sqlite3'

export type ReminderLevel = 1 | 2 | 3

export interface SenderReminderConfig {
  reminder1_wait_days: number
  reminder1_subject: string
  reminder1_body: string
  reminder2_wait_days: number
  reminder2_subject: string
  reminder2_body: string
  reminder3_wait_days: number
  reminder3_subject: string
  reminder3_body: string
}

export function templateFor(
  level: ReminderLevel,
  cfg: SenderReminderConfig
): { subject: string; body: string; waitDays: number } {
  if (level === 1) {
    return {
      subject: cfg.reminder1_subject,
      body: cfg.reminder1_body,
      waitDays: cfg.reminder1_wait_days
    }
  }
  if (level === 2) {
    return {
      subject: cfg.reminder2_subject,
      body: cfg.reminder2_body,
      waitDays: cfg.reminder2_wait_days
    }
  }
  return {
    subject: cfg.reminder3_subject,
    body: cfg.reminder3_body,
    waitDays: cfg.reminder3_wait_days
  }
}

// Pick the next level for an invoice based on how many reminders we've
// already sent. Caps at 3 (Letzte Mahnung); after that the user has to
// escalate offline. Returns null if already at level 3.
export function nextLevel(sentCount: number): ReminderLevel | null {
  if (sentCount >= 3) return null
  return (sentCount + 1) as ReminderLevel
}

export interface ReminderContext {
  customerName: string
  invoiceNumber: string
  amountChf: string
  issuedDate: string
  dueDate: string
  daysOverdue: number
  senderName: string
}

// Fills the placeholder slots in a reminder template. Same placeholder
// set as the existing email_template ({customer}, {number}, {sender})
// plus the reminder-specific ones ({amount}, {issued}, {due},
// {days_overdue}).
export function renderTemplate(text: string, ctx: ReminderContext): string {
  return text
    .replaceAll('{customer}', ctx.customerName)
    .replaceAll('{number}', ctx.invoiceNumber)
    .replaceAll('{amount}', ctx.amountChf)
    .replaceAll('{issued}', ctx.issuedDate)
    .replaceAll('{due}', ctx.dueDate)
    .replaceAll('{days_overdue}', String(ctx.daysOverdue))
    .replaceAll('{sender}', ctx.senderName)
}

// Whole calendar days between two YYYY-MM-DD dates (today minus due).
// Negative if due is in the future. Uses UTC to avoid DST edge cases.
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10))
  )
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)))
  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

// True if the invoice is eligible for the given reminder level today.
// Level 1: due date + reminder1_wait_days days <= today.
// Level 2/3: previous reminder's sent_at + reminderN_wait_days <= today.
export function isLevelDue(
  level: ReminderLevel,
  dueDate: string,
  lastReminderAt: string | null,
  cfg: SenderReminderConfig,
  today: string
): boolean {
  const waitDays =
    level === 1
      ? cfg.reminder1_wait_days
      : level === 2
        ? cfg.reminder2_wait_days
        : cfg.reminder3_wait_days
  if (level === 1) {
    return daysBetween(dueDate, today) >= waitDays
  }
  if (!lastReminderAt) return false
  return daysBetween(lastReminderAt.slice(0, 10), today) >= waitDays
}

// Counts existing reminders for an invoice + returns the most recent
// sent_at (or null). One round trip both for eligibility checks and
// for the next-level decision.
export function reminderState(
  db: Database,
  invoiceId: number
): { count: number; lastSentAt: string | null } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(sent_at) AS last
       FROM invoice_reminders WHERE invoice_id = ?`
    )
    .get(invoiceId) as { n: number; last: string | null }
  return { count: row.n, lastSentAt: row.last }
}
