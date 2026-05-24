<div align="center">

# 💸 batze

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

## What is batze?

batze (Swiss-German slang for money) is a single-user finance app for a Swiss
freelancer or one-person GmbH. It handles the boring money admin of running a solo
business, from "I bought something" to "I sent the invoice and got paid", without a
SaaS subscription and without your financial data living on someone else's server.

It is deliberately single-user and Swiss-first: CHF, MWST (8.1 %), 5-Rappen rounding,
cantonal public holidays, and the QR-bill are first-class, not afterthoughts.

> Read the [vision](docs/idea/VISION.md) for the why, and the
> [feature spec](docs/idea/FEATURES.md) for the what.

## Features

- **Expenses** with receipt uploads (PDF or image), categories, and filters
- **Income** for salary and clients, with automatic Swiss pay-date calculation that
  shifts around weekends and cantonal holidays
- **Customers** book with per-customer rates
- **Articles**: reusable invoice line items
- **Invoices** with correct MWST, 5-Rappen rounding, a print-ready PDF, and the Swiss
  QR-bill
- **Dashboard**: income vs expenses, net, a 6-month trend, and what is still outstanding
- **Single owner** login; everything private and stored locally under `data/`

## Tech stack

- [Nuxt 4](https://nuxt.com) (Vue 3, Nitro server)
- [Nuxt UI](https://ui.nuxt.com) on Tailwind CSS v4
- SQLite via better-sqlite3
- Sealed-cookie auth with nuxt-auth-utils
- Docker and Docker Compose, with Mailpit for email in development

## Quick start

batze runs in Docker.

```bash
git clone https://github.com/zeaiso/batze.git
cd batze
cp .env.example .env   # then edit the secrets
docker compose up
```

- App: http://localhost:3000 (log in with the credentials from your `.env`)
- Mailpit (dev email): http://localhost:8125

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full development guide.

## Documentation

| Doc | What's inside |
| --- | --- |
| [Development](docs/DEVELOPMENT.md) | Local setup, environment, database, project structure |
| [Vision](docs/idea/VISION.md) | What batze is for and the guiding principles |
| [Features](docs/idea/FEATURES.md) | Every planned feature, explained |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Commit convention](docs/COMMIT_CONVENTION.md) | Commit message format |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and open an
issue to discuss your idea before sending a pull request.

## License

[MIT](LICENSE) © zeaiso
