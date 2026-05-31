# Development

batze runs entirely in Docker for development: the Nuxt app plus a Mailpit mail server.

## Prerequisites

- Docker and Docker Compose

Node and Yarn run inside the container, so you do not need them on your host (though
having them helps your editor's type-checking).

## Getting started

```bash
cp .env.example .env
docker compose up
```

- App: http://localhost:3000
- Mailpit web UI: http://localhost:8125 (SMTP on host port 1125)

The app hot-reloads on file changes. Source is bind-mounted into the container, while
`node_modules` lives in a container-owned volume so native modules are built for Linux.

## Environment variables

Copy `.env.example` to `.env` and adjust. `.env` is gitignored.

| Variable                           | Purpose                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `NUXT_ADMIN_USERNAME`              | Owner account, seeded on first launch                 |
| `NUXT_ADMIN_PASSWORD`              | Owner password, seeded on first launch                |
| `NUXT_SESSION_PASSWORD`            | Secret that seals the session cookie (32+ characters) |
| `NUXT_SMTP_HOST`, `NUXT_SMTP_PORT` | SMTP target (Mailpit in development)                  |

## Adding a dependency

Because `node_modules` is a container-owned volume, install on the host and then sync
it into the running container:

```bash
yarn add <package>
docker compose exec app yarn install
```

## Database

batze uses SQLite (better-sqlite3) at `data/batze.db`. The whole `data/` folder
(database plus uploaded files) is your data: back it up and you have backed up
everything. It is gitignored.

### Migrations

Migrations are an append-only list in `server/utils/migrate.ts`, tracked in a
`schema_migrations` table, and applied automatically on server startup. To add one,
append an entry with the next ordered name and its SQL. Never edit a migration that has
already been applied; add a new one instead.

### Demo data

`yarn seed` (or `docker compose exec app yarn seed`) wipes the business tables, keeps the
owner login, and fills the database with a realistic month at a glance: categories, six
months of expenses, salary and freelance income, customers, articles, and invoices. Run
it once the app has started (so the schema exists).

## Project structure

```
app/              Nuxt app (pages, layouts, components, middleware)
server/api/       API endpoints (Nitro)
server/utils/     db connection, migrations, mailer
server/plugins/   startup plugins (migrate, seed owner)
docs/             documentation
data/             SQLite db and uploads (gitignored)
```

## Troubleshooting

If the dev server throws an odd module-resolution error (for example
`ENOTDIR ... server/utils/<file>.ts/package.json`) after many hot-reloads or after
moving or renaming route files, its module graph has gone stale. Restart the app:

```bash
docker compose restart app
```

If it persists, clear the Nuxt build cache and restart for a fully fresh build:

```bash
docker compose exec app rm -rf .nuxt
docker compose restart app
```

This only affects dev. The production build is a clean `yarn build`, not HMR.

## Production build

```bash
docker build --target prod -t batze .
```

The production image runs the self-contained Nitro server with
`node .output/server/index.mjs`.

## Commit messages

This project follows Conventional Commits. See [COMMIT_CONVENTION.md](COMMIT_CONVENTION.md).
