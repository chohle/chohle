# Tech stack

What chohle is built from, and why each piece is here. The guiding choices are
**one runtime** (Node, server and client), **one file you back up** (a SQLite database),
and **no external services** required to run it.

## Framework & UI

- **[Nuxt 4](https://nuxt.com)** — the full-stack framework. The browser app and the
  HTTP API live in one project: Vue 3 pages under `app/`, server routes under
  `server/api/` running on Nuxt's Nitro server.
- **[Vue 3](https://vuejs.org)** with **[Vue Router](https://router.vuejs.org)** — the
  component and routing layer for every page in `app/`.
- **[Nuxt UI 4](https://ui.nuxt.com)** — the component library (buttons, tables, modals,
  forms) built on **Tailwind CSS v4**, so styling is utility classes plus a small amount
  of Sass (`sass-embedded`).
- **[@nuxtjs/i18n](https://i18n.nuxtjs.org)** — translations. Matters here because
  customer-facing documents (invoices, quotes, emails) render in the customer's language
  (de / fr / it / en), independent of the owner's UI language.
- **[Lucide icons](https://lucide.dev)** via `@iconify-json/lucide` — the icon set used
  across the sidebar and app.
- **[Tiptap](https://tiptap.dev)** + **vue-draggable-plus** — rich-text editing (email
  bodies, signatures) and drag-to-reorder (invoice/quote line items, pipeline cards).

## Data & auth

- **[SQLite](https://www.sqlite.org)** via **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**
  — the entire database is a single file under `data/`. better-sqlite3 is synchronous,
  which keeps the server code simple. It is a native module, which is why dev runs in
  Docker (the binary is built for Linux). Schema changes are append-only migrations in
  `server/utils/migrate.ts`, applied on startup.
- **[nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)** — authentication. The
  session lives in a sealed (encrypted, signed) cookie keyed by `NUXT_SESSION_PASSWORD`;
  there is no session table and no third-party auth provider. Single owner, seeded from
  `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` on first launch.

## Documents (PDF, QR-bill, import/export)

- **[PDFKit](https://pdfkit.org)** — generates the print-ready invoice and quote PDFs
  server-side (`server/utils/invoicePdf.ts`, `quotePdf.ts`).
- **[SwissQRBill](https://github.com/schoero/swissqrbill)** — the Swiss QR-bill stitched
  onto invoice PDFs and served as standalone SVG, with QRR / SCOR payment references.
- **[fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)** — parses
  camt.053 bank statements for [bank reconciliation](features/bank-reconciliation.md).
- **[fflate](https://github.com/101arrowz/fflate)** — builds the year-end
  [tax export](features/tax-export.md) ZIP (Erfolgsrechnung + receipts + CSV).

## Email

- **[Nodemailer](https://nodemailer.com)** — outbound SMTP (invoices, quotes, reminders,
  replies). In development it points at the Mailpit sidecar; in production at a real
  provider. See [Sending email](SENDING_EMAIL.md).
- **[ImapFlow](https://imapflow.com)** + **[mailparser](https://nodemailer.com/extras/mailparser/)**
  — inbox sync and message parsing for per-project [email](features/email.md)
  (IMAP / Gmail / Outlook).

## Content security

- **[isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify)** —
  sanitizes inbound email HTML and rich-text content before it is stored or rendered, on
  both server and client.

## Tooling & dev environment

- **[Docker](https://www.docker.com) + Docker Compose** — the dev environment is the app
  container plus **[Mailpit](https://mailpit.axllent.org)** (a local mail catcher). See
  [Quick start](QUICK_START.md).
- **[Yarn 4](https://yarnpkg.com)** (via Corepack) — the package manager, pinned with
  `packageManager` in `package.json`.
- **[TypeScript](https://www.typescriptlang.org)** — everywhere, frontend and server.
- **[Vitest](https://vitest.dev)** — the test suite under `test/` (`yarn test`).
- **[Playwright](https://playwright.dev)** — browser automation for end-to-end checks.
- **[Prettier](https://prettier.io)** with the Tailwind plugin — formatting
  (`yarn format`).

## Why these choices

- **Single-user, self-hosted.** No queue, no Redis, no Postgres, no auth provider. One
  Node process and one SQLite file. Back up `data/` and you have backed up everything.
- **Swiss-first primitives are libraries, not bolt-ons.** The QR-bill, MWST rounding,
  and cantonal pay dates are handled in code with dedicated tools rather than a SaaS.
- **One language end to end.** TypeScript on the server and the client keeps shared logic
  (e.g. invoice math in `shared/`) genuinely shared.
