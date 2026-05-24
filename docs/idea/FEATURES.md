# Features: each part explained

This is what Batze is meant to do, part by part. Routes are the in-app pages; "API" notes
the main server endpoints behind them.

## 1. Sign-in (single owner)

Batze is a solo app, so there's exactly **one account: the owner**.

- The owner is created automatically on first launch from `.env`
  (`NUXT_ADMIN_USERNAME` and `NUXT_ADMIN_PASSWORD`).
- Log in with username and password; the session is a sealed cookie.
- Change the password anytime in **Settings**.
- There is no sign-up, no team, and no admin area. The owner simply has full access to
  everything.

> Why a login at all? It's your financial data on a self-hosted server, so it's
> password-protected by default.

## 2. Dashboard (`/`)

The month-at-a-glance home screen. Pick a month with the switcher and everything updates.

- **Stat cards:** Income, Expenses, Net, and Expected income (with how much is still
  outstanding).
- **6-month trend:** simple bars of income vs expenses.
- **Expenses by category:** where the money went this month.
- **Recurring income this month:** each salary or job with a Received, Partial, or Pending
  badge.

API: `GET /api/summary?month=YYYY-MM`.

## 3. Expenses (`/expenses`)

Track what you buy, with the receipt.

- Fields: **title, amount, currency** (CHF default), **date, category, vendor, notes**.
- **Receipts:** attach one or more **PDFs or images** per expense (drag or click to
  upload). They're stored on disk and can be opened or deleted.
- **Filters:** by month and by category (chips).
- Each row shows the category icon and color, vendor, date, amount, and receipt chips.

API: `GET/POST /api/expenses`, `PUT/DELETE /api/expenses/[id]`,
`POST /api/expenses/[id]/attachments`, `GET/DELETE /api/attachments/[id]`.

## 4. Income: Salary and Jobs (`/income`)

Your employment income, with **automatic Swiss pay-date calculation** (the standout
feature).

For each job you store: **company name, job title, monthly salary, currency, payout day**
(for example the 25th), **canton**, and a **payout-adjustment rule**.

### The payout engine

Given the payout day, the engine works out the **real** pay date for each month:

- If it lands on a **weekend** or a **public holiday in that job's canton**, it shifts the
  date earlier or later, per your rule (or it leaves it alone).
- Public holidays come from the **OpenHolidays API** (accurate Swiss cantonal data),
  fetched once per year and **cached in the database** (works offline afterwards).

Example (Luzern, paid on the 25th, "pay earlier"):

| Month | Nominal | Why | Actually pays |
| --- | --- | --- | --- |
| Jan 2026 | 25th (Sun) | weekend | **Fri 23 Jan** |
| May 2026 | 25th (Mon) | Pfingstmontag | **Fri 22 May** |
| Dec 2026 | 25th (Fri) | Weihnachten | **Thu 24 Dec** |

Each job card shows the computed pay date and *why* it moved. A **Mark as paid** toggle
records that month's payment (dated on the computed day) so the dashboard's
expected-vs-received stays accurate.

API: `GET/POST /api/income/sources`, `PUT/DELETE /api/income/sources/[id]`,
`GET /api/income/overview?month=…`, `POST /api/income/sources/[id]/toggle-paid`.
Engine: `server/utils/payout.ts` and `server/utils/holidays.ts`.

## 5. Customers / Partners (`/customers`)

A proper customer book ("Kunden"), its own section, because customers feed into the
invoicing side.

- A customer can be a **Company or a Person**.
- Fields: name, contact person, e-mail, phone, **address** (street, ZIP, city, country),
  **language**, customer number, **price category, discount %, payment term (days)**,
  website, founding year, social, the Swiss business numbers **UID / MWST / HR**, and a
  **logo**.
- The list shows logo, number, city, and payment term; click into a **detail page**.
- The **detail page** shows the full record, the customer's **invoices**, and a **Rates**
  panel (see Articles).

API: `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/[id]`,
`POST/GET /api/customers/[id]/logo`.

## 6. Articles (`/articles`)

Reusable invoice line items: your "thing with a price," ready to drop onto an invoice.

- Fields: **name** (for example "Laufende Arbeiten"), **unit** (Stunden, Pauschal, and so
  on), **default price**, and **default MWST %**.
- On an invoice, picking an article **auto-fills** its unit, price, and VAT.
- This is deliberately tiny, not a full product catalog (no barcodes, SEO, or images).

### Per-customer rates

The same article can cost different amounts for different customers. On a customer's
**Rates** panel you can override an article's price just for them (leave it blank to use
the default). The invoice editor then auto-fills *that customer's* rate.

API: `GET/POST /api/item-presets`, `PUT/DELETE /api/item-presets/[id]`,
`GET/PUT /api/customers/[id]/rates`.

## 7. Invoices (`/invoices/[id]`)

Create an invoice from a customer's page; it opens the editor.

- **Header:** title or period (auto-suggested like `Q2/26: customer`), invoice number
  (auto-incremented, editable), status (Draft, Sent, Paid), issue date, and
  **payable-until** (auto = issue date plus the customer's payment term).
- **Line items** (your "tasks"): article, description, quantity, unit, discount %, MWST %,
  and unit price, each with a live amount.
- **Totals:** Netto, MWST per rate, and Total, using correct **Swiss 5-Rappen rounding**.
  (Verified against a real invoice: Netto 5'362.50, MWST 8.1 % 434.35, Total 5'796.85.)

### PDF preview and QR-bill

- **PDF Vorschau** saves the invoice and opens a clean, print-optimized page laid out like
  a real Swiss invoice (logo, sender and recipient, Rechnung Nr., German dates, MWST nr.,
  Zahlbar bis, line items, totals). Use the browser's **Print, Save as PDF**.
- At the bottom is the **Swiss QR-bill (QR-Rechnung)**, generated with the official
  `swissqrbill` library. The reference type is chosen automatically from your IBAN:
  a **QR-IBAN gives QRR** (27-digit), a **regular IBAN gives SCOR** (`RFxx…`).

API: `GET/PUT/DELETE /api/invoices/[id]`, `POST /api/customers/[id]/invoices`,
`GET /api/invoices/[id]/qrbill`. Math: `shared/utils/invoice.ts`; QR-bill:
`server/utils/qrbill.ts`.

## 8. Categories (`/categories`)

Simple labels to organize money, split into **Expense** and **Income** categories, each
with a **color** and an **icon**. Used to group and visualize expenses on the dashboard.

API: `GET/POST /api/categories`, `DELETE /api/categories/[id]`.

## 9. Settings (`/settings`)

- **My company:** your invoice **sender**: name, address, MWST number, **IBAN** (for the
  QR-bill), e-mail, phone, website, and a **logo**. Filled once, used on every invoice.
- **Change password.**
- A note about where your data lives (`data/`).

API: `GET/PUT /api/company`, `POST/GET /api/company/logo`.

## Cross-cutting details

- **Currency:** CHF by default; each entry can use another currency. Money is stored as
  integer minor units (Rappen) to avoid rounding bugs.
- **Receipts and logos** are stored on disk under `data/uploads/`.
- **Everything is private to the single owner** and lives in `data/`.