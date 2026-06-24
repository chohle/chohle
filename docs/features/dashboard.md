# Dashboard, Activity & Payments

The three "see where I stand" views. The **Dashboard** is the
single-screen overview of a month; **Activity** is the chronological
event feed; **Payments** is the year's realised receipts. None of them
let you edit anything. They only read and aggregate what
[Invoices](invoices.md), [Income](income.md) and
[Expenses](expenses.md) already store.

## Where to find it

- **Dashboard**: Sidebar -> Workspace -> Dashboard. Route `/`,
  `layout-dashboard` icon. The app's home page.
- **Activity**: Sidebar -> Workspace -> Activity. Route `/activity`,
  `activity` icon.
- **Payments**: Sidebar -> Finance -> Payments. Route `/payments`,
  `wallet` icon.

## Dashboard

A month-scoped overview. The `MonthSelect` in the header drives the
`month` query (`YYYY-MM`); everything reloads for that month.

- **Net hero**: `net = income − expenses` for the month, with a
  sparkline of `max(0, income − expenses)` across the trend, and a
  "% vs last month" delta against the previous trend entry.
- **Sub-strip KPIs**: *From customers* (`invoiceIncome`, falling back
  to total `income`), *Expected* (sum of all `income_sources` salaries,
  showing `outstanding` = unpaid expected salary as its delta), and
  *Expenses out* (`expenses`).
- **Income** here = salary (`income_payments` for the month) **plus**
  invoice revenue. Invoice revenue is the `total_rappen` frozen on each
  invoice when it was marked paid, attributed by `paid_at` month, so
  past income doesn't shift when items or VAT registration change later.
- **Last 6 months**: an income-vs-expenses bar chart. The window comes
  from `lastSixMonths(month)` in `summary.get.ts`, which walks back
  `i = 5 … 0` to build six `YYYY-MM` keys ending at the selected month.
  Each trend point's income sums salary (`income_payments.month`) and
  paid-invoice totals (`invoices.paid_at`) for that month.
- **Recurring income**: one row per `income_sources` entry, showing the
  company, computed pay date for the month (`computePayout`, canton
  holiday aware via `getHolidays`), and salary amount.
- **Cashflow {year}**: a separate year card with its own chevron year
  picker and income/expense/net totals, fed by `/api/summary/year`
  (independent of the month selector).

`outstanding` deliberately stays a salary measure (expected − received
salary). Invoice receivables live on the Invoices page, not here.

## Activity

A reverse-chronological feed composed on the fly from existing
tables (no separate event store), capped at `MAX_EVENTS = 200` and
limited to the **last year**. Each event has a `kind`, an `at` date,
and `**bold**`/`*italic*` inline markup rendered via `UiRichText`.

The five event kinds (`activity.get.ts`):

| Kind      | Icon          | Source / when                                                         |
| --------- | ------------- | --------------------------------------------------------------------- |
| `sent`    | `send`        | Every `sent`/`paid` invoice, dated `issue_date` (paid invoices were sent first). |
| `paid`    | `check`       | Paid invoice, dated `paid_at`.                                        |
| `overdue` | `bell`        | `sent` invoice whose `due_date` is before today, dated the due date.  |
| `expense` | `receipt`     | Each expense, dated `e.date`, with vendor and `*category*`.           |
| `salary`  | `coins`       | Each `income_payments` row, dated `p.date`, with company.             |

Invoice and salary `paid`/`sent` rows link to `/invoices/<id>`;
expense and salary rows have no link.

Client-side controls (`activity.vue`):

- **Period** segmented control: `week` (last 7 days), `month` (current
  month to date), `lastMonth`, and `custom` (an exact month via
  `MonthSelect`). Each defines a half-open `[start, end)` window applied
  to `e.at`.
- **Kind filters**: five checkboxes (`paid`, `sent`, `overdue`,
  `expense`, `salary`), each showing its full-window `counts[kind]`.
  Counts come from the whole window so they stay accurate even after the
  200-event truncation.
- Filtered events are bucketed into **Today / This week / Earlier** and
  paginated `PAGE_SIZE = 25` at a time. Changing filters, period or
  custom month resets pagination.
- **This week** side card shows net / in / out: `paid` and `salary`
  count as in, `expense` as out, over the trailing 7 days.

## Payments

A year of **realised receipts** (money actually received) grouped by
month. The chevron year picker drives the `year` query.

`payments.get.ts` returns two row kinds for the selected year:

- **`invoice`**: every invoice with `status = 'paid'` whose `paid_at`
  falls in the year. Labelled by invoice number (or title), sub-labelled
  with the customer name, links to `/invoices/<id>`, amount is
  `total_rappen`.
- **`salary`**: every `income_payments` row whose `date` is in the
  year, labelled by company, sub-labelled with the pay `month`.

Rows are merged and sorted newest-first by `date`. The page (`payments.vue`)
groups them by `YYYY-MM` month with a per-month subtotal, and the KPI row
shows the year **Total**, **From invoices**, and **From salary** splits.

> Note: this view is about *received* money, not outstanding debt.
> Open/unpaid invoices and the dunning workflow live on the
> [Invoices](invoices.md) and [Reminders](reminders.md) pages.

## Backed by

- `server/api/summary.get.ts`: month overview; `lastSixMonths(month)`
  builds the 6-month trend window; computes income, `invoiceIncome`,
  expenses, `net`, `expected`, `outstanding`, `byCategory`, `trend`,
  `recurring` (via `computePayout` + `getHolidays`).
- `server/api/summary/year.get.ts`: the yearly cashflow card.
- `server/api/activity.get.ts`: merges invoices/expenses/salaries into
  the event stream; `escapeMd` sanitises user strings; returns `events`,
  per-kind `counts`, and the `week` aggregate.
- `server/api/payments.get.ts`: paid invoices + salary receipts for a
  year.
- Pages: `app/pages/index.vue`, `app/pages/activity.vue`,
  `app/pages/payments.vue`.
- No dedicated test suite covers these read-only endpoints.
