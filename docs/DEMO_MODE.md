# Demo mode (`CHOHLE_DEMO`)

chohle is single-tenant by default. **Demo mode** turns one instance into a
public playground where every visitor gets their **own isolated, seeded
sandbox**: they can click around, create invoices, drag projects, etc., and
only ever see their own changes. One visitor can't affect another, and nobody
can break it for everyone.

Enable it with `CHOHLE_DEMO=true`, then restart (or redeploy). It's **off by
default**; when off, chohle is the normal single-tenant app and none of the demo
code runs.

## What it does

- **Per-visitor sandbox**: a `demo_sid` cookie maps to a private SQLite copy of
  a pristine, seeded template. One visitor's writes never reach another's.
- **No login wall**: a guest session is created automatically on first visit.
- **Seeded in the visitor's language**: the sandbox is seeded from the browser's
  `Accept-Language`; a **Reset** button (top banner) re-seeds a fresh copy.
- **Sandboxed side effects**: outbound email is swallowed, background mail sync
  is skipped, and the mailbox connect/sync endpoints return `403`, so a public
  visitor can't make the app reach real external services.
- **Self-cleaning**: idle sandboxes (default 2 h) and anything past the
  500-session cap are evicted automatically, so disk stays bounded.

## Configuration

| Variable              | Default         | Purpose                                                                                                                           |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CHOHLE_DEMO`         | _(off)_         | `true` enables demo mode                                                                                                          |
| `DEMO_DATA_PATH`      | `data/demo`     | where templates + sandboxes live. Use a fast local disk / Docker named volume, **not** a macOS bind mount (SQLite corrupts there) |
| `DEMO_SESSION_TTL_MS` | `7200000` (2 h) | idle time before a sandbox is evicted                                                                                             |
| `DEMO_MAX_SESSIONS`   | `500`           | cap; the oldest sandbox is evicted past this                                                                                      |

To run a demo publicly, follow [Hosting](HOSTING.md) and set
`CHOHLE_DEMO=true` (the production compose already points `DEMO_DATA_PATH` at the
safe named volume).

## How it works (internals)

| File                            | Role                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/utils/demo.ts`          | The session → database manager: builds one seeded template per locale, copies it per session, caches open handles, evicts idle/over-cap ones.                       |
| `server/middleware/00.demo.ts`  | Per request: assigns the `demo_sid` cookie, binds the session db to `event.context`, auto-logins a guest, and blocks the external-service endpoints.                |
| `server/utils/db.ts`            | `useDb()` resolves the request's sandbox via Nitro's async context (`useEvent()`), so every existing query is sandboxed with **no changes to the rest of the app**. |
| `server/utils/seedDemo.ts`      | The bundled, localized demo seed, shared by the dev CLI (`yarn seed`) and the demo template builder, so it ships in `.output` for production.                       |
| `app/components/DemoBanner.vue` | The "your changes are private, Reset" banner, shown only when `CHOHLE_DEMO` is on.                                                                                  |

The boot plugins (`migrate`, `seed-owner`, `mail-sync`) all early-return in demo
mode. There is no shared database; each sandbox is migrated and seeded when its
template is built.
