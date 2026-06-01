// Lists every overdue invoice with its reminder state, so the
// Mahnungen page can show two groups: "ready to send" (next level
// past its wait days) and "waiting" (still inside the wait window).

import {
  type ReminderLevel,
  type SenderReminderConfig,
  daysBetween,
  isLevelDue,
  nextLevel
} from '~~/server/utils/reminders'

export interface ReminderListRow {
  invoice_id: number
  number: string
  issue_date: string
  due_date: string
  total_rappen: number
  customer_id: number
  customer_name: string
  customer_email: string | null
  sent_count: number
  last_reminder_at: string | null
  days_overdue: number
  next_level: ReminderLevel | null
  eligible: boolean
  // For "Waiting" rows we surface how many days the user still has
  // to wait so the UI can show "ready in 3 days" without recomputing.
  wait_days_remaining: number | null
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDb()
  const today = new Date().toISOString().slice(0, 10)

  const cfg = db
    .prepare(
      `SELECT reminder1_wait_days, reminder1_subject, reminder1_body,
              reminder2_wait_days, reminder2_subject, reminder2_body,
              reminder3_wait_days, reminder3_subject, reminder3_body
       FROM sender WHERE id = 1`
    )
    .get() as SenderReminderConfig | undefined
  if (!cfg) return [] as ReminderListRow[]

  // Sent invoices past their due date. LEFT JOIN aggregates so we get
  // sent_count + last_reminder_at in one trip without N+1.
  const rows = db
    .prepare(
      `SELECT i.id AS invoice_id, i.number, i.issue_date, i.due_date,
              i.total_rappen, c.id AS customer_id, c.name AS customer_name,
              c.email AS customer_email,
              COUNT(r.id) AS sent_count, MAX(r.sent_at) AS last_reminder_at
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       LEFT JOIN invoice_reminders r ON r.invoice_id = i.id
       WHERE i.status = 'sent'
         AND i.due_date IS NOT NULL
         AND i.due_date < ?
       GROUP BY i.id
       ORDER BY i.due_date ASC`
    )
    .all(today) as Array<{
    invoice_id: number
    number: string
    issue_date: string
    due_date: string
    total_rappen: number
    customer_id: number
    customer_name: string
    customer_email: string | null
    sent_count: number
    last_reminder_at: string | null
  }>

  const out: ReminderListRow[] = []
  for (const r of rows) {
    const next = nextLevel(r.sent_count)
    const daysOverdue = daysBetween(r.due_date, today)
    if (next === null) {
      // All three levels already sent; still surface in the list so
      // the user knows it's stuck, just not actionable.
      out.push({
        ...r,
        days_overdue: daysOverdue,
        next_level: null,
        eligible: false,
        wait_days_remaining: null
      })
      continue
    }
    const eligible = isLevelDue(next, r.due_date, r.last_reminder_at, cfg, today)
    let waitDaysRemaining: number | null = null
    if (!eligible) {
      const waitDays =
        next === 1
          ? cfg.reminder1_wait_days
          : next === 2
            ? cfg.reminder2_wait_days
            : cfg.reminder3_wait_days
      const elapsed =
        next === 1
          ? daysBetween(r.due_date, today)
          : r.last_reminder_at
            ? daysBetween(r.last_reminder_at.slice(0, 10), today)
            : 0
      waitDaysRemaining = Math.max(0, waitDays - elapsed)
    }
    out.push({
      ...r,
      days_overdue: daysOverdue,
      next_level: next,
      eligible,
      wait_days_remaining: waitDaysRemaining
    })
  }
  return out
})
