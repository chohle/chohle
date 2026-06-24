# Customers (Kunden / Clients / Clienti)

chohle customers are the people and companies you bill. A customer
record carries the master data that every downstream document reuses:
the billing address printed on invoices and quotes, the document
language, the default payment term, and a per-customer article library.

## Where to find it

- **Sidebar -> Workspace -> Customers** (route `/customers`, users
  icon) opens the list page with a type filter (all / company /
  person), a name sort, and a row per customer showing name, customer
  number, city, and payment term.
- **Add customer** in the top right opens a slideover form. The same
  form (re)opens for edit. Type toggles between `company` and
  `person`; the business section (UID / MWST / HR number / founding
  year) only shows for companies.
- Clicking a row opens the detail page `/customers/[id]` with a KPI
  strip (total billed / paid / outstanding / invoice count) and three
  tabs: **Details**, **Articles**, **Projects**.

## Customer fields

Parsed and validated server-side by `parseCustomer` in
`server/utils/customer.ts`; only `name` is strictly required (400
otherwise). The columns map 1:1 to the `customers` table:

| Field                            | Column             | Notes                                                  |
| -------------------------------- | ------------------ | ------------------------------------------------------ |
| type                             | `type`             | `person` or `company`, defaults to `company`           |
| name                             | `name`             | required                                               |
| contact person                   | `contact_person`   |                                                        |
| email / phone                    | `email` / `phone`  | email locks the quote/invoice send flow when missing   |
| street / zip / city              | `street` ...       | printed as the document billing address                |
| country                          | `country`          | defaults to `CH`                                       |
| language                         | `language`         | `de` / `fr` / `it` / `en`, defaults to `de` (below)    |
| customer number                  | `customer_number`  | free text, shown in the list and PDFs                  |
| price category                   | `price_category`   | free-text label                                        |
| discount %                       | `discount_percent` | defaults to 0                                          |
| payment term days                | `payment_term_days`| defaults to 30, drives invoice due dates (below)       |
| website / social                 | `website` / `social`|                                                       |
| UID / MWST / HR number / founded | `uid` / `mwst` ... | company-only business identifiers                      |

A logo can be uploaded per customer (`/api/customers/[id]/logo`,
stored in `logo_path`) and shows as the avatar on the detail page.

## Document language

`language` is one of `de` / `fr` / `it` / `en`. `parseCustomer`
rejects anything outside that set and falls back to `de` (the table
default in migration `0009_customers`). It drives the language of
generated documents, not the app UI:

- **Invoice PDF**: `server/utils/invoicePdf.ts` picks the label
  catalog by `customer.language`, including the Swiss QR-bill language
  (DE/FR/IT/EN). The QR-bill is the payment slip Swiss banks scan.
- **Quote PDF**: `server/utils/quotePdf.ts` localises the header to
  "Rechnung/Offerte" wording the same way.
- **Email send**: the subject and body templates are prefilled in the
  customer's language, so a Geneva customer with `language: 'fr'`
  receives "Devis ..." / "Facture ..." even when your own UI is in
  German. This is the Swiss reality: French- and Italian-speaking
  customers expect their documents in their language.

> Note: the PDF generators default to `en` when a customer has no
> language, but in practice the column is never null (DB default `de`).

## Per-customer rates via per-customer articles

There is no separate rate table anymore. Earlier (`0011_customer_rates`)
chohle stored price overrides in a `customer_rates(customer_id,
article_id, price_rappen)` table; migration `0015_drop_customer_rates`
removed it. Instead, `0014_articles_customer_id` added a nullable
`customer_id` to `articles`:

- `customer_id IS NULL`: a global article in the shared library.
- `customer_id = <id>`: an article that belongs only to that customer,
  with its own name, unit, price, and MWST.

The **Articles** tab on the detail page manages these via:

- `GET  /api/customers/[id]/articles`: lists that customer's articles
  (`server/api/customers/[id]/articles.get.ts`).
- `POST /api/customers/[id]/articles`: creates one with
  `customer_id` set (`...articles.post.ts`).

Both 404 if the customer doesn't exist. See [Articles](articles.md)
for the shared library and how rows are picked into invoice lines.

## Payment term days

`payment_term_days` (default 30) is the customer's net payment window.
When a draft invoice is created from a project
(`server/api/projects/[id]/invoices.post.ts`) or when a quote is
converted (`server/utils/quotes.ts`), the new invoice's `due_date` is
computed as `issue_date + payment_term_days`. So changing the term on
the customer changes the due date of every invoice created afterward
(existing invoices keep their stored dates). See
[Invoices](invoices.md) and [Quotes](quotes.md).

## Backed by

- Migration `0009_customers` creates the `customers` table (including
  `language` default `de` and `payment_term_days` default 30).
- Migrations `0011_customer_rates` -> `0014_articles_customer_id` ->
  `0015_drop_customer_rates`: the per-customer-rates table was replaced
  by per-customer articles (a nullable `customer_id` on `articles`).
- `server/utils/customer.ts`: `parseCustomer`, the validated
  `CustomerInput`, and the shared `CUSTOMER_COLUMNS` / `customerValues`
  used by both INSERT and UPDATE.
- Endpoints: `server/api/customers/index.get.ts` (list),
  `index.post.ts` (create), `[id].get.ts` / `[id].put.ts` /
  `[id].delete.ts`, plus per-customer sub-resources
  `[id]/articles.{get,post}.ts`, `[id]/invoices.get.ts`,
  `[id]/projects.get.ts`, and `[id]/logo.{get,post,delete}.ts`.
- `server/utils/invoicePdf.ts` and `server/utils/quotePdf.ts` consume
  `customer.language`; `projects/[id]/invoices.post.ts` and
  `server/utils/quotes.ts` consume `payment_term_days` for `due_date`.
