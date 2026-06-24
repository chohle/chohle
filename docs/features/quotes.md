# Quotes (Offerten / Devis / Offerte)

chohle quotes are pre sale proposals that turn into invoices when the
customer accepts. Same shape as an invoice minus payment specific
bits: there's no QR slip on the PDF (a quote isn't a payment
instrument), no due date, and the validity window uses a `valid_until`
date instead.

## Where to find it

- **Sidebar -> Workspace -> Quotes** opens the list page with a KPI
  strip (drafts / sent / accepted / all), a status filter, and a row
  per quote.
- **New quote** in the top right opens a small modal asking only for
  the customer. The project link gets set later in the editor where
  the dedicated picker has room.

## Status workflow

```
draft  --send-->  sent  --accept-->  accepted  --convert-->  invoice
  |                 |
  |                 +--decline-->  declined  (terminal)
  +--accept-->  accepted  (you can mark accepted without sending)
```

Action buttons in the editor's sticky footer surface only what makes
sense for the current status:

| Status   | Buttons                                                    |
| -------- | ---------------------------------------------------------- |
| draft    | Save / Send / Accept / Delete                              |
| sent     | Save / Send (resend) / Decline / Accept / Delete           |
| accepted | Save / Convert to invoice / Delete (hidden once converted) |
| declined | Save / Delete                                              |

There's no auto expiry. When today is past `valid_until` and the
quote is still draft or sent, the editor surfaces a "validity passed
{date}" warn pill next to the status chip so the user notices, but
the row stays where it is and the user decides whether to bump the
date, resend, or decline.

## Templates and the send modal

The Send button opens a modal mirroring the invoice send flow:

- **Subject** prefilled from `quotes.defaultSubject` in the
  customer's language (i.e. a Geneva customer with `language: 'fr'`
  sees "Devis ..." even when your UI is German).
- **Body** prefilled from `quotes.defaultMessage`, also in the
  customer's language, with placeholders filled in:
  `{customer}` / `{number}` / `{sender}`.
- The customer's email is locked in the recipient field; sending is
  disabled until the customer has one.

The PDF attached to the email is generated fresh by
`generateQuotePdf(id)` on every send, so corrections since the
original draft reach the customer.

## Convert to invoice

The Convert button is only shown once a quote is in the **accepted**
state. It rejects with a clear toast when:

- the quote has no project linked (invoices require one per migration
  `0029_invoices_require_project`)
- the quote was already converted (`converted_invoice_id` is set;
  prevents accidental double conversion)
- the quote was declined

On success the server creates a draft invoice with:

- the same customer and project
- the same title
- every line item, with `position` preserved (so the invoice rows
  appear in the order the user dragged them on the quote)
- a fresh `issue_date` (today) and `due_date` (today + customer's
  `payment_term_days`)

It then stamps `converted_invoice_id` on the quote and flips its
status to `accepted` (if it wasn't already). The browser navigates
straight to `/invoices/<new id>` so the user can review before
sending.

## What gets copied on convert

| Field        | Copied? | Notes                                                                                                                                                               |
| ------------ | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| customer_id  |   yes   |                                                                                                                                                                     |
| project_id   |   yes   |                                                                                                                                                                     |
| title        |   yes   |                                                                                                                                                                     |
| line items   |   yes   | with `position` preserved                                                                                                                                           |
| number       |   no    | starts blank; invoices have their own numbering scheme                                                                                                              |
| issue_date   |   no    | set to today on the new invoice                                                                                                                                     |
| valid_until  |   no    | quotes-only; the invoice has `due_date` instead                                                                                                                     |
| accepted_at  |   no    | quote-only metadata                                                                                                                                                 |
| total_rappen |   no    | snapshotted on the invoice when it's marked paid (the value freezes there so realized revenue stays stable; backfill plugin populates it for already paid invoices) |

## Backed by

- Migration `0034_quotes` creates `quotes` + `quote_items` and the
  `converted_invoice_id` pointer back to `invoices`.
- `server/utils/quotes.ts` houses `convertQuoteToInvoice(db, id)` so
  the endpoint and the vitest suite share one implementation.
- `server/utils/quotePdf.ts` mirrors the invoice PDF without the QR
  slip; localises the header to "Offerte" / "Devis" / "Offerta" /
  "Quote" based on the customer's language.
- `test/quotes.test.ts` covers the conversion rules: copy order,
  status stamp, already-converted (409), declined (422), no project
  (422), 404, plus a transactional safety test confirming a failed
  items copy doesn't leave a partial invoice behind.
