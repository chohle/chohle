# Features

The full feature set of chohle, one page per feature. For a nicely rendered version,
see [chohle.ch/features](https://chohle.ch/features/).

chohle is deliberately single-user and Swiss-first: CHF, MWST (8.1 %), 5-Rappen
rounding, cantonal public holidays, and the QR-bill are first-class, not afterthoughts.

## Money in and out

| Feature                                       | What it does                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| [Expenses](expenses.md)                       | Receipt uploads, categories, filters, optional per-expense Vorsteuer |
| [Income](income.md)                           | Salary and client income with automatic Swiss pay-date calculation   |
| [Bank reconciliation](bank-reconciliation.md) | camt.053 import + auto-match by QR-reference (folder / EBICS)        |

## Billing

| Feature                   | What it does                                                    |
| ------------------------- | --------------------------------------------------------------- |
| [Customers](customers.md) | Per-customer rates, payment terms, and document language        |
| [Articles](articles.md)   | Reusable invoice/quote line items, global or per-customer       |
| [Quotes](quotes.md)       | Offerten you convert to an invoice in one click                 |
| [Invoices](invoices.md)   | Correct MWST, 5-Rappen rounding, print-ready PDF, Swiss QR-bill |
| [Reminders](reminders.md) | Staged overdue-payment reminders (1st, 2nd, final notice)       |

## Projects, mail, and money tracking

| Feature                               | What it does                                                   |
| ------------------------------------- | -------------------------------------------------------------- |
| [Projects & pipeline](projects.md)    | Track sales (Vertrieb) and procurement (Einkauf) across stages |
| [Email](email.md)                     | Per-project conversations + a triage queue for inbound mail    |
| [Email signatures](signatures.md)     | Reusable rich-HTML signatures with embedded images             |
| [Dashboard & overviews](dashboard.md) | Income vs expenses, net, 6-month trend, activity, payments     |

## Year-end and setup

| Feature                                   | What it does                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| [Tax export](tax-export.md)               | Year-end ZIP: Erfolgsrechnung + receipts + Treuhänder CSV   |
| [Business profile](business-profile.md)   | Sender identity, banking (QR-IBAN), logo, templates, locale |
| [AI assistant](assistant.md) _(optional)_ | Local LLM that drafts customers, invoices, and quotes       |

> **Single owner**: there is one login; everything is private and stored locally under
> `data/`.

For connecting an inbox and sending mail, see the setup guides at the
[docs root](../): [Mail sync](../MAIL_SYNC.md) and [Sending email](../SENDING_EMAIL.md).
