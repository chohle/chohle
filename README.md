<div align="center">

# 💸 chohle

**A clean, self-hosted finance tool for one person.**

Track what you spend (with receipts), know exactly when your money lands, manage your
customers, and bill them with proper Swiss invoices and a QR-Rechnung. Your data, your
server, no subscription.

![License](https://img.shields.io/badge/license-MIT-blue)
![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)
![Made for Switzerland](https://img.shields.io/badge/made%20for-Switzerland%20%F0%9F%87%A8%F0%9F%87%AD-red)

<!-- TODO: add a screenshot of the dashboard once the UI is further along -->

</div>

---

## What is chohle?

chohle (Swiss-German slang for money) is a single-user finance app for a Swiss
freelancer or one-person GmbH. It handles the boring money admin of running a solo
business, from "I bought something" to "I sent the invoice and got paid", without a
SaaS subscription and without your financial data living on someone else's server.

It is deliberately single-user and Swiss-first: CHF, MWST (8.1 %), 5-Rappen rounding,
cantonal public holidays, and the QR-bill are first-class, not afterthoughts.

## Features

- **Expenses** with receipt uploads (PDF or image), categories, and filters
- **Income** for salary and clients, with automatic Swiss pay-date calculation that
  shifts around weekends and cantonal holidays
- **Customers** with per-customer rates and document language
- **Articles**: reusable invoice line items
- **Quotes** (Offerten) you can convert to an invoice in one click
- **Invoices** with correct MWST, 5-Rappen rounding, a print-ready PDF, and the Swiss
  QR-bill
- **Projects & pipeline**: track sales and procurement deals across stages
- **Reminders**: staged overdue-payment reminders (1st, 2nd, final notice)
- **Email**: per-project conversations, with IMAP / Gmail / Outlook inbox sync
- **Dashboard**: income vs expenses, net, a 6-month trend, and what is still outstanding
- **Single owner** login; everything private and stored locally under `data/`

> Want to put it online or run a public playground? See
> [Hosting](docs/HOSTING.md) and [Demo mode](docs/DEMO_MODE.md). Both are
> optional — chohle runs fine entirely on your own machine.

## Tech stack

- [Nuxt 4](https://nuxt.com) (Vue 3, Nitro server)
- [Nuxt UI](https://ui.nuxt.com) on Tailwind CSS v4
- SQLite via better-sqlite3
- Sealed-cookie auth with nuxt-auth-utils
- Docker and Docker Compose, with Mailpit for email in development

## Quick start

chohle runs in Docker.

```bash
git clone https://github.com/chohle/chohle.git
cd chohle
cp .env.example .env   # then edit the secrets
docker compose up
```

- App: http://localhost:3000 (log in with the credentials from your `.env`)
- Mailpit (dev email): http://localhost:8125

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide.

## Documentation

| Doc                                                | What's inside                                           |
| -------------------------------------------------- | ------------------------------------------------------- |
| [Development](docs/DEVELOPMENT.md)                 | Local setup, environment, database, project structure   |
| [Reminders](docs/REMINDERS.md)                     | Staged overdue-payment reminders                        |
| [Quotes](docs/QUOTES.md)                           | Offers and convert-to-invoice                           |
| [Mail sync](docs/MAIL_SYNC.md)                     | Connecting an inbox (IMAP / Gmail / Outlook)            |
| [Sending email](docs/SENDING_EMAIL.md)             | SMTP setup for outbound (invoices, quotes, replies)     |
| [Bank reconciliation](docs/BANK_RECONCILIATION.md) | camt.053 import + auto-match payments (folder / EBICS)  |
| [Hosting](docs/HOSTING.md)                         | _Optional_ — putting it online (VPS + Docker + Caddy)   |
| [Demo mode](docs/DEMO_MODE.md)                     | _Optional_ — public per-visitor sandbox (`CHOHLE_DEMO`) |
| [Commit convention](docs/COMMIT_CONVENTION.md)     | Commit message format                                   |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and open an
issue to discuss your idea before sending a pull request.

## License

[MIT](LICENSE) © zeaiso
