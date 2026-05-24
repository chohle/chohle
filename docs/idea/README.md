# batze

> **batze** is a clean, self-hosted finance tool for a **single person**: a Swiss
> freelancer or one-person company. The idea: track what you spend (with receipts), know
> exactly when your money lands (salary + clients, holiday-aware), manage your customers,
> and bill them with proper Swiss invoices and a QR-Rechnung.

These docs explain what the project is meant to be, what each part will do, how it's built,
and where it's going.

> **Note on the name:** the product is called **batze** (Swiss-German slang for money).

## Contents

| Doc | What's inside |
| --- | --- |
| [VISION.md](./VISION.md) | What I'm trying to achieve, who it's for, the guiding principles |
| [FEATURES.md](./FEATURES.md) | Every planned feature explained: expenses, income, customers, articles, invoices, QR-bill… |

## In one minute

- **What I'm trying to achieve:** give one person (me) a single, no-nonsense place to
  handle the boring money admin of freelancing in Switzerland, without a SaaS subscription
  or my data living on someone else's server.
- **Who it's for:** one person (solo freelancer / one-person GmbH). Not a team product.
- **Where it'll live:** self-hosted on your own server, with all data in a local `data/` folder.
- **What it's meant to do:** expenses + receipts, salary & client income with Swiss
  holiday-aware payout dates, a customer CRM, reusable articles, and invoices with the
  Swiss MWST + QR-bill (print to PDF).
- **Money rules:** Swiss-first. CHF, MWST (8.1 %), 5-Rappen rounding, cantonal holidays,
  QR-Rechnung.