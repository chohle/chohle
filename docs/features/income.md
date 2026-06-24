# Income

chohle tracks recurring income sources (salaried jobs, retainer
clients) and shows, per month, the **real** day each one pays out
after Swiss weekends and cantonal holidays are taken into account.
Each source can be marked received so the page doubles as a
month-by-month income ledger.

## Where to find it

**Sidebar -> Finance -> Income** (route `/income`, `i-lucide-banknote`
icon) opens the page. A `MonthSelect` in the header drives everything;
a KPI strip shows total for the month, received, pending, and the
number of sources. Each source is a card with its amount, nominal pay
day, canton, adjustment rule, the computed pay date for the selected
month, and a received / pending chip you can toggle.

## Income sources

Each source is a row in `income_sources` with:

| Column         | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `company`      | employer or client name (required)                     |
| `job_title`    | optional sub-label                                     |
| `salary_rappen`| amount in Rappen (the form takes CHF, ×100 on save)    |
| `currency`     | defaults to `CHF`                                       |
| `payout_day`   | nominal day of month, 1-31                              |
| `canton`       | one of the 26 cantons; picks the holiday calendar      |
| `payout_rule`  | `earlier` \| `later` \| `none` (the shift direction)   |

There is no separate "salary vs client income" type. Any source is
just a recurring monthly amount; the form defaults to payout day `25`,
canton `LU`, and rule `earlier`. The overview endpoint lists every
source and computes its pay date for the selected month. It does not
distinguish salary from a client retainer.

## Swiss pay-date calculation

This is the core of the feature, in `server/utils/payout.ts`. Salaries
in Switzerland are paid on a fixed day, but banks don't process on
weekends or public holidays, so the actual pay date drifts. Holidays
are **cantonal**, so the same nominal day can resolve differently for a
Lucerne job versus a Geneva one.

`computePayout(year, month, payoutDay, rule, holidays)` builds the
nominal date and resolves it:

1. **Clamp** the day to the month: `Math.min(payoutDay, lastDay)`. A
   `payout_day` of 31 in February resolves to the 28th (or 29th).
2. **Detect a conflict** via `conflict(d, holidays)`: Saturday/Sunday
   returns `'Weekend'`; otherwise a hit in the cantonal holiday map
   returns that holiday's name (e.g. `'Pfingstmontag'`). No conflict
   returns `null`.
3. **Shift** if there is a conflict and the rule isn't `none`:
   - `earlier` steps back one day at a time (`step = -1`)
   - `later` steps forward (`step = +1`)
   - it keeps stepping **while** the new day is still a weekend or
     holiday, so it walks across a holiday *and* an adjacent weekend in
     one go.
4. **Result**: `{ date, reason }`. `reason` is the original conflict
   name (`'Weekend'` / the holiday) when a shift happened, else `null`.
   With rule `none` the date is returned untouched and `reason` is
   always `null`, even when it lands on a weekend.

The card shows the computed `pay_date`; if `reason` is set it renders a
"moved · {reason}" pill, otherwise "on schedule".

### Worked example (Lucerne, pays on the 25th, rule `earlier`)

- **May 2026**: 2026-05-25 is Pfingstmontag (Whit Monday). `earlier`
  steps back over Sun 24 and Sat 23 to **Fri 2026-05-22**, reason
  `'Pfingstmontag'`.
- **Dec 2026**: 2026-12-25 (Friday) is Weihnachten. `earlier` lands on
  **Thu 2026-12-24**, reason `'Weihnachten'`.
- **Jan 2026**: 2026-01-25 is a Sunday. `earlier` → **2026-01-23**;
  `later` → **2026-01-26**; `none` → 2026-01-25 unchanged.

### Where holidays come from

`getHolidays(canton, year)` in `server/utils/holidays.ts` returns a
`date -> name` map. On first use it fetches the canton's public
holidays from the [OpenHolidays API](https://openholidaysapi.org)
(`CH-<canton>`, German names) and caches them in the `holidays` table
(keyed by `canton, year, date`), so it works **offline** afterwards. If
the API is unreachable and nothing is cached, it degrades to an empty
map. Weekend shifting still works, holiday shifting is skipped.
`overview.get.ts` memoises the map per canton so each canton is fetched
at most once per request.

## Marking income received

`POST /api/income/sources/{id}/toggle-paid` with `{ month }` toggles a
row in `income_payments` (unique per `source_id, month`). On the first
toggle it recomputes the pay date with `computePayout` and stores the
snapshot (`date`, `amount_rappen`); toggling again deletes the row. The
overview reads which sources are paid for the month from this table to
drive the received / pending chips and the KPI totals. See the
[Dashboard](dashboard.md) for how received income rolls up.

## Backed by

- Migrations `0005_holidays` (cached cantonal holidays),
  `0006_income_sources` (sources + the `payout_rule` CHECK constraint),
  and `0007_income_payments` (per-month received snapshots).
- `server/utils/payout.ts`: `computePayout()` and the `conflict()`
  weekend/holiday detector; the `earlier` / `later` / `none` rules.
- `server/utils/holidays.ts`: `getHolidays()`, OpenHolidays fetch +
  DB cache + offline fallback.
- Endpoints under `server/api/income/`: `overview.get.ts`,
  `sources/index.{get,post}.ts`, `sources/[id].{put,delete}.ts`, and
  `sources/[id]/toggle-paid.post.ts`.
- `test/payout.test.ts` covers the rules: plain working day untouched,
  weekend earlier/later, walking past a holiday and its adjacent
  weekend, holiday-to-previous-working-day, rule `none` no-op, and the
  end-of-month day clamp.
