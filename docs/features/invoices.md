# Invoices (Rechnungen / Factures / Fatture)

chohle invoices are the payment instrument that closes out a project:
a numbered, MWST-correct document with a Swiss QR-bill stitched onto the
last PDF page. They start as a draft (often from a [Quote](quotes.md)
or straight off a project), get emailed to the customer, and are marked
paid once the money lands.

## Where to find it

- **Sidebar -> Workspace -> Invoices** (route `/invoices`,
  `i-lucide-file-text` icon) opens the list page: a KPI strip
  (paid / sent-awaiting / drafts / total, each summing `total_rappen`),
  a draft/sent/paid/all segmented filter, and a row per invoice
  (number, customer, title, project, issue date, status chip, total).
- There is **no "New invoice" button on the list**. Invoices require a
  project (see migration `0029` below), so they are born from a project
  via `POST /api/projects/:id/invoices`, or by converting an accepted
  quote. The list's empty-state CTA just points the user at
  **Customers** to get there.
- Creation pulls the customer from the project, prefills the title from
  the project label/name, sets `issue_date` to today and `due_date` to
  today + the customer's `payment_term_days`, and leaves `number` blank
  for the owner to fill in.

## Status workflow

The editor (`/invoices/:id`) is a three-step wizard mirrored by the
`status` column (`draft` / `sent` / `paid`, enforced by a `CHECK`
constraint) and a `step` cursor (0/1/2, persisted via
`PATCH /api/invoices/:id/step` so reopening a draft resumes where you
left off):

```
draft  --send-->  sent  --mark paid-->  paid
 (step 0)         (step 1)              (step 2)
                    ^                      |
                    +------ mark unpaid ---+
```

- **Step 0 (draft)** — header (title, number, issue date) and line
  items. Save validates each line (description required, quantity and
  unit price must be positive).
- **Step 1 (send)** — set the due date, preview the PDF, edit the
  branded email (subject/body prefilled in the customer's language with
  `{customer}` / `{number}` / `{due}` / `{sender}` placeholders), pick a
  signature, then send.
- **Step 2 (paid)** — shows the total and a **Mark paid** button (or
  **Mark unpaid** to revert to `sent`). Marking paid stamps `paid_at`
  and snapshots `total_rappen`.

`PUT /api/invoices/:id` only accepts `status` in `draft`/`sent`/`paid`
and requires a valid `issueDate` + `dueDate` (`YYYY-MM-DD`); it replaces
all `invoice_items` in one transaction, preserving row order via
`position`.

## Swiss correctness

All money is stored in **Rappen** (integer centimes); `unit_price_rappen`
on each line, totals computed in `shared/utils/invoice.ts` and only
divided by 100 for display (`de-CH` formatting).

- **MWST (VAT) defaults to 8.1%** — the `invoice_items.mwst_percent`
  column defaults to `8.1`, and new editor rows seed `8.1`. Each line
  carries its **own** rate, so a single invoice can mix 8.1% (standard),
  2.6% (reduced), etc. Picking an article copies that article's
  `default_mwst` onto the line.
- **VAT registration gate** — if the sender's `vat_registered` flag is
  off (e.g. a private person under the CHF 100k threshold),
  `computeInvoiceTotals(lines, false)` charges **no MWST**: the total is
  just the net, with no rate breakdown and the netto/VAT lines hidden in
  the UI and PDF.
- **5-Rappen rounding (Rappenrundung)** — `round5()` rounds to the
  nearest 0.05 CHF:

  ```ts
  export function round5(rappen: number): number {
    return Math.round(rappen / 5) * 5
  }
  ```

  It is applied to **each per-rate MWST amount** and to the final
  `totalRappen`. Line nets (`lineNetRappen`) are plain
  `Math.round`ed to the Rappen — only VAT and the grand total snap to 5.
- **Per-VAT-rate breakdown** — `computeInvoiceTotals` groups line nets
  by `mwstPercent` into a `mwstByRate[]` (sorted ascending), each with
  its own rounded `mwstRappen`; `totalMwstRappen` is the sum of those.
  Worked example from `test/invoice.test.ts`: net CHF 5'362.50 at 8.1%
  -> MWST 434.35 -> total **5'796.85** (`536250` / `43435` / `579685`
  Rappen).
- **Print-ready PDF** — `server/utils/invoicePdf.ts`
  (`generateInvoicePdf(id)`) renders an A4 PDF with PDFKit in the
  **customer's language** (de/fr/it/en locale catalogs): letterhead
  (logo or company name), meta block (invoice no., customer no., date,
  payable-until), sender return line + recipient address, subject, line
  table, and the netto / per-rate VAT / total summary. A contact footer
  (phone · email · website · MWST no.) sits just above the slip.
- **Swiss QR-bill** — generated with the `swissqrbill` library. The PDF
  attaches it via `SwissQRBill(...).attachTo(pdf)`; a standalone SVG is
  served by `GET /api/invoices/:id/qrbill` (also localized to the
  customer's language). Both require a valid sender **IBAN** and a
  complete sender address (422 otherwise). The **payment reference** is
  deterministic: `buildReference(id, iban)` produces a **QRR** (27-digit
  padded id + mod-10 check) for a QR-IBAN, or an ISO-11649 **SCOR**
  (`RF` + check digits + id) for a regular IBAN — so an incoming payment
  reference reverses straight back to the invoice (see
  [Bank reconciliation](bank-reconciliation.md)). The `amount` is set
  only when the total is > 0, and the `debtor` block only when the
  customer has a full address.

## Sending

`POST /api/invoices/:id/send` requires the customer to have an email and
the sender to have a valid IBAN + complete address. It **generates the
PDF fresh** (`generateInvoicePdf(id)`) on every send, so any edits since
the draft reach the customer, wraps the editor's HTML message in the
shared branded email shell, attaches the PDF named `<number>.pdf`, and
sends it. On success the invoice flips to `status = 'sent'` and clears
`paid_at` / `total_rappen` (it isn't paid yet).

## Marking paid

Setting `status = 'paid'` via `PUT` stamps `paid_at` (today, kept if
already set) and writes the **`total_rappen` snapshot** — the computed
total frozen at that moment. This freezes realized revenue so it stays
stable even if line items or VAT registration change later; the column
is `NULL` while unpaid. Existing paid invoices were backfilled by the
`backfill-invoice-totals` server plugin (migration `0020`). The
[Tax export](tax-export.md) and revenue figures lean on this snapshot.

## Reminders

`POST /api/invoices/:id/remind` sends an overdue **Mahnung** (levels
1-3) — only for a `sent`, past-due invoice, using the same email + fresh
PDF pipeline, the level-specific template from `sender`, and a same-day
per-level dedupe (409). It logs to `invoice_reminders` so history and
eligibility can be derived (`GET .../reminders`). See
[Reminders](reminders.md) for the escalation rules.

## Backed by

- Migrations: `0012_invoices` (creates `invoices` + `invoice_items`,
  the `8.1` MWST default, `status` CHECK), `0016_sender_vat`
  (`vat_registered`), `0019_invoice_paid_at`, `0020_invoice_total_snapshot`,
  `0021_invoice_step`, `0027_invoices_project_id`,
  **`0029_invoices_require_project`** (rebuilds the table with
  `project_id NOT NULL ... ON DELETE RESTRICT`), and
  `0033_invoice_reminders`.
- `shared/utils/invoice.ts` — `round5()`, `lineNetRappen()`,
  `computeInvoiceTotals()`, `normalizeArticleId()` (shared by the editor,
  list, PDF, QR-bill and reminder endpoints).
- `server/utils/invoicePdf.ts` — `generateInvoicePdf()`, the print-ready
  PDF with the embedded QR-bill.
- `server/utils/qrReference.ts` — `buildReference()` / `parseReference()`
  for the QRR/SCOR reference, kept as exact inverses for reconciliation.
- `server/api/invoices/[id]/qrbill.get.ts` — the standalone SVG QR-bill.
- Tests: `test/invoice.test.ts` (totals, 5-Rappen rounding, per-rate
  grouping, non-VAT case, `normalizeArticleId`), `test/qrReference.test.ts`
  (reference round-trip), `test/documentPdf.test.ts` (PDF rendering).
- Related: [Quotes](quotes.md), [Customers](customers.md),
  [Articles](articles.md), [Reminders](reminders.md),
  [Tax export](tax-export.md), [Bank reconciliation](bank-reconciliation.md).
</content>
</invoke>
