# Business Profile (Sender identity & branding)

The "who you are" settings: the one sender record that supplies your
name, address, IBAN, logo, and default email copy to every invoice,
quote, reminder, and outbound email. It's a single-row table
(`sender`, `id = 1`) so there is exactly one identity for the
workspace.

## Where to find it

- **User avatar menu -> Billing** (route `/billing`,
  `app/pages/billing.vue`) is the actual business-profile editor:
  person/company toggle, name + address, contact, IBAN, VAT
  registration, company numbers, and the logo. Despite the prompt's
  framing, `/profile` (`app/pages/profile.vue`) only changes your
  username/password — the sender identity lives under Billing.
- **User avatar menu -> Settings** (route `/settings`,
  `app/pages/settings.vue`) holds the rest: UI language (General tab),
  the invoice email template (Email tab), and the three reminder
  templates (Reminders tab).

## Business identity

Edited on `/billing`, saved by `PUT /api/sender`
(`server/api/sender.put.ts`):

- `type` — `person` or `company`. Switching to `company` reveals the
  UID / MWST-number / HR-number / founding-year fields and flips
  `vat_registered` on by default.
- `name`, `street`, `zip`, `city`, `country` (defaults `CH`).
- `email`, `phone`, `website`.
- `vat_registered` — whether you charge MWST. Off (e.g. a private
  person under the CHF 100k threshold) means invoices carry no VAT.

Client-side validation requires `name`, a well-formed `email`, and
`iban`; the server is the source of truth and trims every field.

## Banking — IBAN / QR-IBAN

There is one `iban` column, not separate IBAN and QR-IBAN fields. The
QR-bill code inspects it at PDF time: `buildReference()` in
`server/utils/qrReference.ts` calls `isQRIBAN(account)` and picks the
reference scheme accordingly:

- **QR-IBAN -> QRR reference**: the invoice id zero-padded to 26
  digits plus a mod-10 check digit (27 digits total).
- **regular IBAN -> SCOR reference**: `RF` + ISO 11649 check digits +
  the bare invoice id.

The reference is derived deterministically from the invoice id so a
camt.053 credit can be matched straight back to the invoice it pays
(see [Bank reconciliation](bank-reconciliation.md)). Quotes carry no
QR slip and no IBAN dependency. The IBAN is also validated against the
statement account on camt.053 import (migration `0038_bank_imports`).

## Logo

`LogoUpload.vue` on the Billing form posts a **PNG-only** file to
`POST /api/sender/logo` (`server/api/sender/logo.post.ts`), which
stores it and writes `logo_path` (migration `0013_sender_logo`).
PNG is enforced because the image is embedded in invoice/quote PDFs,
where it renders reliably and keeps transparency. `DELETE
/api/sender/logo` clears it.

`GET /api/sender/logo` (`logo.get.ts`) is **public on purpose** and
cache-busted with `?v=<stored-name>`: branded emails reference the
logo by absolute URL, and a recipient opening the mail has no session.
The same image prints on the [Invoices](invoices.md) and
[Quotes](quotes.md) PDFs and shows in the branded
[Email](email.md) header.

## Default document & email templates

- **Invoice cover email** — `sender.email_template` (migration
  `0018_sender_email_template`), edited on Settings -> Email and saved
  by `PUT /api/email-template` (`server/api/email-template.put.ts`).
  A single HTML body with placeholders `{customer}` `{number}` `{due}`
  `{sender}` filled per send; the branded shell/footer are added on
  send. Default copy is German.
- **Reminder templates** — three Mahnung levels, each with
  `reminderN_subject`, `reminderN_body`, and `reminderN_wait_days`
  (migration `0033_invoice_reminders`), edited on Settings ->
  Reminders and saved together by `PUT /api/reminder-templates`
  (`server/api/reminder-templates.put.ts`, clamps wait days 0–365).
  Placeholders add `{amount}` `{issued}` `{days_overdue}`. See
  [Reminders](reminders.md).
- **Quote subject/message** are **not** stored on `sender`. They come
  from i18n keys (`quotes.defaultSubject` / `quotes.defaultMessage`),
  and the invoice subject from `email.subject`.

### Per-language, not per-locale

Document copy is localized to the **customer's** `language`, not your
UI locale. The invoice and quote editors load the customer's language
messages (`custLocale = customer.language`) and prefill the subject
there, so a Geneva customer with `language: 'fr'` gets French copy
even while your interface is German. The stored `email_template`
itself is a single body (German by default) and is reused across
customers.

## UI locale

Your interface language is `owner.locale` (migration
`0017_owner_locale`, default `en`). Settings -> General changes it via
`PUT /api/locale` (`server/api/locale.put.ts`), which accepts
`en` / `de` / `fr` / `it`, persists to `owner`, and refreshes the
session. This is purely the UI language; it does not change the
language of documents sent to customers.

## Backed by

- Migrations: `0008_sender` (the row), `0013_sender_logo`,
  `0016_sender_vat`, `0018_sender_email_template`,
  `0033_invoice_reminders` (reminder columns), `0017_owner_locale`.
- Sender endpoints: `GET /api/sender`, `PUT /api/sender`,
  `POST` / `DELETE` / `GET /api/sender/logo`.
- Template endpoints: `PUT /api/email-template`,
  `PUT /api/reminder-templates`; locale: `PUT /api/locale`.
- QR reference logic: `server/utils/qrReference.ts`, unit-tested in
  `test/qrReference.test.ts`.

See also: [Invoices](invoices.md) · [Reminders](reminders.md) ·
[Email](email.md) · [Sending email](../SENDING_EMAIL.md).
