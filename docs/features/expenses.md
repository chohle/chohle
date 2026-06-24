# Expenses (Ausgaben / Dépenses / Spese)

chohle expenses are the business costs you record against a month: a
title, an amount in CHF, an optional vendor and category, and any number
of receipts (Belege) you scan or photograph. They feed the
[tax export](tax-export.md): an optional per-expense VAT rate lets the
report reclaim the input VAT (Vorsteuer) hidden in each gross amount.

## Where to find it

- **Sidebar -> Finance -> Expenses** (route `/expenses`, receipt icon)
  opens the month view: a KPI strip, a per-category breakdown donut, a
  quick category filter, and a row per expense.
- **MonthSelect** in the page head drives the list; the page fetches
  `/api/expenses?month=YYYY-MM` and shows only that month, newest first
  (`ORDER BY date DESC, id DESC`).
- **Add expense** (top right, and in the empty state) opens a slide-over
  form. The same form, prefilled, handles editing via the row pencil.

## The list page

- **KPIs**: total this month, number of entries, distinct categories,
  and average per entry, all in CHF, rendered with `de-CH` formatting
  and no decimals.
- **By category**: a donut + legend summing every expense in the month
  that has a category. Uncategorised expenses are left out of it.
- **Quick filter**: chips for each expense category. Toggling one or more
  narrows the table (and the KPIs) to those categories client-side; the
  month query is unchanged.

## Fields

| Field    | Stored as                 | Notes                                                               |
| -------- | ------------------------- | ------------------------------------------------------------------- |
| Title    | `title`                   | required, trimmed                                                   |
| Amount   | `amount_rappen` (INTEGER) | required, > 0; entered in CHF, stored as Rappen (`amount × 100`)    |
| Currency | `currency`                | defaults to `CHF`                                                   |
| Date     | `date`                    | required, `YYYY-MM-DD`                                              |
| Category | `category_id`             | optional; expense-type [categories](../) only, `SET NULL` on delete |
| Vendor   | `vendor`                  | optional                                                            |
| Notes    | `notes`                   | optional                                                            |
| VAT rate | `vat_rate` (REAL)         | optional %, `0`-`100`, default `0`; see below                       |

`parseExpense` validates server-side (bad input → 400 `Invalid expense`),
so the same rules apply to the API and the in-app form. The form also
validates: title and amount required, amount positive, VAT rate 0-100.

## Per-expense VAT rate (Vorsteuer)

The VAT field only appears when the sender is **VAT-registered**
(`/api/sender` → `vat_registered`); for everyone else it stays hidden and
`vat_rate` stays `0`. When set, the [tax export](tax-export.md) computes
the input VAT contained in the gross amount as
`round5(gross × rate / (100 + rate))` (i.e. the Vorsteuer you can
reclaim), rounded to 5 Rappen like the rest of the CHF math.

## Receipts (attachments)

Receipts attach to an expense and live in a private `attachments` table
(`expense_id` → `expenses`, `ON DELETE CASCADE`). Files are stored under
`uploadsDir()` (`data/uploads`, or `UPLOADS_PATH`) under a random UUID
name; the original filename is sanitised and kept only as `filename` for
display and download.

- **In the form**: when creating, picked files sit in a pending list and
  upload only after the expense itself saves (so a Beleg can be attached
  on create). A receipt-upload failure is non-fatal: the expense is kept
  and the slide-over still closes.
- **In the row**: the `ExpenseReceipts` chip lets you upload more or
  delete existing receipts inline.
- **Download/view**: `GET /api/attachments/:id` streams the file inline
  with its stored `mime_type` and `X-Content-Type-Options: nosniff`.
  Uploaded files are **not** served from a public directory.
- **Delete**: `DELETE /api/attachments/:id` removes the row and the file
  from disk. Deleting an expense also `rm`s all its stored receipts.

### Allowed receipt files

The type is sniffed from the file's **magic bytes**, not the
client-declared MIME, then the canonical extension and MIME are derived
from that. Unrecognised → 415 `Unsupported receipt type`.

| Type | Detected signature |
| ---- | ------------------ |
| PDF  | `%PDF`             |
| PNG  | PNG signature      |
| JPEG | `FF D8 FF`         |
| GIF  | `GIF`              |
| WebP | `RIFF…WEBP`        |

The file picker hints `application/pdf,image/*`. Max **20 MB** per file
(`MAX_RECEIPT_BYTES`); larger → 413 `Receipt too large (max 20 MB)`. SVG
is intentionally excluded (it can carry inline script).

## Endpoints

| Method & path                        | Purpose                                |
| ------------------------------------ | -------------------------------------- |
| `GET /api/expenses?month=YYYY-MM`    | list a month (or all if month omitted) |
| `POST /api/expenses`                 | create → `{ id }`                      |
| `PUT /api/expenses/:id`              | update (404 if missing)                |
| `DELETE /api/expenses/:id`           | delete expense + its receipt files     |
| `POST /api/expenses/:id/attachments` | multipart upload, one or more `files`  |
| `GET /api/attachments/:id`           | stream a receipt inline                |
| `DELETE /api/attachments/:id`        | delete a receipt                       |

All require an authenticated session (`requireUserSession`).

## Backed by

- Migration `0003_expenses` creates `expenses`; `0004_attachments`
  creates `attachments`; `0048_expense_vat_rate` adds the
  `vat_rate REAL NOT NULL DEFAULT 0 CHECK (0-100)` column.
- `server/utils/expense.ts`: `parseExpense` (shared validation, CHF →
  Rappen, VAT clamping).
- `server/utils/uploads.ts`: `uploadsDir`, `MAX_RECEIPT_BYTES`,
  `detectReceiptType`, `sanitizeFilename`.
- `server/utils/taxReport.ts`: `inputVat` consumes `vat_rate` for the
  Vorsteuer figure in the tax export.
- Endpoints under `server/api/expenses/` and `server/api/attachments/`.
