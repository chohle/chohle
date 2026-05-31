// Activity feed: composed on the fly from invoices / expenses / salaries
// so we don't need a separate event store. Returns the merged, sorted
// stream truncated to a sensible cap.

type Kind = 'paid' | 'sent' | 'overdue' | 'expense' | 'salary'

interface ActivityEvent {
  id: string
  kind: Kind
  at: string // ISO date (YYYY-MM-DD)
  text: string // markdown-ish, with **bold** and *italic* for inline emphasis
  amount_rappen: number
  link?: string
}

const MAX_EVENTS = 200

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

function escapeMd(s: string) {
  // Inline emphasis uses ** and * — escape user-controlled strings so they
  // don't accidentally enter italic/bold.
  return s.replace(/[*_]/g, '\\$&')
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const db = useDb()
  const today = new Date().toISOString().slice(0, 10)

  // Constrain queries to the last year so the feed doesn't degrade as the
  // workspace ages. Custom-month picks before this window will fall outside
  // the response — acceptable for now, can become a query param later.
  // --- Invoices (sent + paid + overdue) ---
  const invoices = db
    .prepare(
      `SELECT i.id, i.number, i.status, i.issue_date, i.due_date, i.paid_at,
            i.total_rappen, c.name AS customer_name
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.status IN ('sent', 'paid')
       AND (
         i.issue_date >= date('now', '-1 year')
         OR i.paid_at >= date('now', '-1 year')
         OR i.due_date >= date('now', '-1 year')
       )`
    )
    .all() as Array<{
    id: number
    number: string | null
    status: 'sent' | 'paid'
    issue_date: string
    due_date: string
    paid_at: string | null
    total_rappen: number | null
    customer_name: string
  }>

  // --- Expenses ---
  const expenses = db
    .prepare(
      `SELECT e.id, e.title, e.amount_rappen, e.date, e.vendor,
            c.name AS category_name
     FROM expenses e
     LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.date >= date('now', '-1 year')`
    )
    .all() as Array<{
    id: number
    title: string
    amount_rappen: number
    date: string
    vendor: string | null
    category_name: string | null
  }>

  // --- Salaries ---
  const salaries = db
    .prepare(
      `SELECT p.id, p.date, p.amount_rappen, s.company
     FROM income_payments p
     JOIN income_sources s ON s.id = p.source_id
     WHERE p.date >= date('now', '-1 year')`
    )
    .all() as Array<{
    id: number
    date: string
    amount_rappen: number
    company: string
  }>

  const events: ActivityEvent[] = []

  for (const inv of invoices) {
    const amount = inv.total_rappen ?? 0
    const cust = escapeMd(inv.customer_name)
    const num = escapeMd(inv.number || '—')
    const link = `/invoices/${inv.id}`

    // Sent — also synthesised for paid invoices (a paid invoice was sent first).
    events.push({
      id: `inv-${inv.id}-sent`,
      kind: 'sent',
      at: inv.issue_date,
      text: `Sent invoice **${num}** to **${cust}** — CHF ${chf(amount)}`,
      amount_rappen: amount,
      link
    })

    if (inv.status === 'paid' && inv.paid_at) {
      events.push({
        id: `inv-${inv.id}-paid`,
        kind: 'paid',
        at: inv.paid_at.slice(0, 10),
        text: `**${cust}** paid invoice **${num}** — CHF ${chf(amount)}`,
        amount_rappen: amount,
        link
      })
    } else if (inv.status === 'sent' && inv.due_date < today) {
      // Overdue is recorded as of the due date itself.
      events.push({
        id: `inv-${inv.id}-overdue`,
        kind: 'overdue',
        at: inv.due_date,
        text: `**${num}** is now overdue — ${cust} — CHF ${chf(amount)}`,
        amount_rappen: amount,
        link
      })
    }
  }

  for (const e of expenses) {
    const vendor = e.vendor ? escapeMd(e.vendor) : escapeMd(e.title || '—')
    const cat = e.category_name ? ` — *${escapeMd(e.category_name)}*` : ''
    events.push({
      id: `exp-${e.id}`,
      kind: 'expense',
      at: e.date,
      text: `Logged expense **CHF ${chf(e.amount_rappen)}** at ${vendor}${cat}`,
      amount_rappen: e.amount_rappen
    })
  }

  for (const s of salaries) {
    events.push({
      id: `sal-${s.id}`,
      kind: 'salary',
      at: s.date,
      text: `Salary deposit **CHF ${chf(s.amount_rappen)}** from ${escapeMd(s.company)}`,
      amount_rappen: s.amount_rappen
    })
  }

  events.sort((a, b) => b.at.localeCompare(a.at))
  const limited = events.slice(0, MAX_EVENTS)

  // Convenience aggregates for the "This week" stat + per-kind counts.
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenIso = sevenDaysAgo.toISOString().slice(0, 10)

  let weekIn = 0
  let weekOut = 0
  for (const e of events) {
    if (e.at < sevenIso) continue
    if (e.kind === 'paid' || e.kind === 'salary') weekIn += e.amount_rappen
    else if (e.kind === 'expense') weekOut += e.amount_rappen
  }

  // Counts reflect the full window so the filter sidebar stays accurate
  // when the response is truncated to MAX_EVENTS.
  const counts: Record<Kind, number> = { paid: 0, sent: 0, overdue: 0, expense: 0, salary: 0 }
  for (const e of events) counts[e.kind]++

  return {
    events: limited,
    counts,
    week: { net_rappen: weekIn - weekOut, in_rappen: weekIn, out_rappen: weekOut }
  }
})
