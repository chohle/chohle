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

Expenses with receipts, Swiss-correct income and invoicing (MWST, 5-Rappen rounding,
QR-bill), quotes, customers, a sales/procurement pipeline, per-project email, bank
reconciliation, year-end tax export, and an optional AI assistant. Everything is
single-user and self-hosted.

**See the full list (one page per feature) in the
[features documentation](docs/features/README.md)** or, nicely rendered, at
[chohle.ch/features](https://chohle.ch/features/).

> Want to put it online or run a public playground? See
> [Hosting](docs/HOSTING.md) and [Demo mode](docs/DEMO_MODE.md). Both are
> optional; chohle runs fine entirely on your own machine.

## Tech stack

[Nuxt 4](https://nuxt.com) (Vue 3 + Nitro) with [Nuxt UI](https://ui.nuxt.com) on
Tailwind CSS v4, SQLite via better-sqlite3, sealed-cookie auth, and Docker for
development. The [tech stack page](docs/TECH_STACK.md) explains what each piece does and
why it's here.

## Quick start

chohle runs in Docker; no Node or Yarn needed on your host.

```bash
git clone https://github.com/chohle/chohle.git
cd chohle
cp .env.example .env   # then set the admin + session secrets
docker compose up
```

- App: http://localhost:3000 (log in with the credentials from your `.env`)
- Mailpit (dev email): http://localhost:8125

New here? The [quick start guide](docs/QUICK_START.md) walks through every step: what to
set in `.env`, how to generate the session secret, and first login. For the deeper dev
topics, see the [development guide](docs/DEVELOPMENT.md).

## Documentation

| Doc                                            | What's inside                                                 |
| ---------------------------------------------- | ------------------------------------------------------------- |
| [Features](docs/features/)                     | One page per feature: invoices, quotes, reminders, tax, etc.  |
| [Quick start](docs/QUICK_START.md)             | Step-by-step: run chohle locally from scratch                 |
| [Tech stack](docs/TECH_STACK.md)               | What chohle is built from, and why                            |
| [Development](docs/DEVELOPMENT.md)             | Local setup, environment, database, project structure         |
| [Mail sync](docs/MAIL_SYNC.md)                 | Connecting an inbox (IMAP / Gmail / Outlook)                  |
| [Sending email](docs/SENDING_EMAIL.md)         | SMTP setup for outbound (invoices, quotes, replies)           |
| [Hosting](docs/HOSTING.md)                     | _Optional_: putting it online (VPS + Docker + Caddy)          |
| [Demo mode](docs/DEMO_MODE.md)                 | _Optional_: public per-visitor sandbox (`CHOHLE_DEMO`)        |
| [Commit convention](docs/COMMIT_CONVENTION.md) | Commit message format                                         |

## Contributing

Contributions are welcome. Please read the [contributing guide](CONTRIBUTING.md) and open
an issue to discuss your idea before sending a pull request.

## License

[MIT](LICENSE) © zeaiso
