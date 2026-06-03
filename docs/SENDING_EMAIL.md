# Sending email

chohle sends outbound mail — invoices, quotes, payment reminders, and
project replies — through a single SMTP transport. This page covers how to
configure it.

> This is the **send** side. For pulling replies back into a project thread
> (the receive side), see [MAIL_SYNC](MAIL_SYNC.md). The two are independent:
> the inbox you _sync_ and the account you _send from_ don't have to be the
> same, though for clean threading they usually are.

## Two modes, one switch

There is exactly one thing to decide: **is `NUXT_SMTP_USER` set or not?**

| `NUXT_SMTP_USER` | Mode            | What happens                                                       |
| ---------------- | --------------- | ------------------------------------------------------------------ |
| **unset / blank** | Mailpit / dev  | No auth, no TLS, no From check. All mail lands in the Mailpit UI.  |
| **set**           | Real provider  | Authenticates, derives TLS from the port, enforces the From guard. |

That's the whole model. You don't need a separate "use Mailpit yes/no" flag —
the presence of a username _is_ the flag.

### Mailpit (the default — nothing to configure)

Out of the box every send is captured by the Mailpit catch-all that ships in
`docker-compose.yml`; nothing leaves your machine and you read it at
**http://localhost:8125**. This is all most contributors ever need.

In **Docker** (the default), leave the SMTP host/port **unset** in `.env` —
compose points the container at the Mailpit sidecar automatically:

```yaml
- NUXT_SMTP_HOST=${NUXT_SMTP_HOST:-mailpit}
- NUXT_SMTP_PORT=${NUXT_SMTP_PORT:-1025}
```

> Don't set `NUXT_SMTP_HOST=localhost` for Docker — inside the container
> `localhost` is the container itself, not the host, so the send fails. Those
> `localhost:1125` values are only for running **host `yarn dev`** (no Docker),
> where they reach Mailpit's published port:

```env
# host `yarn dev` only:
NUXT_SMTP_HOST=localhost
NUXT_SMTP_PORT=1125
# NUXT_SMTP_USER unset → Mailpit mode
```

### A real provider (when you actually want mail to go out)

Fill in all four auth values. Use the provider's **submission** host and
port — **not** the IMAP port `993`.

```env
NUXT_SMTP_HOST=asmtp.mail.example.ch   # provider's SMTP submission host
NUXT_SMTP_PORT=465                      # 465 = implicit TLS, 587 = STARTTLS
NUXT_SMTP_USER=hello@chohle.ch          # full mailbox address you log in as
NUXT_SMTP_PASS=••••••••                  # that mailbox's password
```

- **`NUXT_SMTP_USER`** is the full email address, and it is normally the same
  string you use to log in to the mailbox.
- **`NUXT_SMTP_PASS`** is that mailbox's password (or an app password, if the
  provider issues those).
- **`NUXT_SMTP_SECURE`** is an optional escape hatch. Leave it unset: TLS is
  derived from the port (`465` → implicit TLS, anything else → STARTTLS). Only
  set `NUXT_SMTP_SECURE=true`/`false` if a host needs something non-standard.

## The From address comes from Billing — and must match

The visible **From** is _not_ an env var. It's the **sender email** set in
**Billing / Abrechnung** (`hello@chohle.ch` in the example). Every send —
invoice, quote, reminder, reply — uses it.

Because of that, there is one rule that matters for deliverability:

> **The Billing sender email must be on the same domain as `NUXT_SMTP_USER`.**

If you authenticate as `hello@chohle.ch` you can only send _as_ a `@chohle.ch`
address. A provider will reject or rewrite a From it doesn't own, and the
recipient's SPF/DKIM checks will fail. chohle enforces this with a **From-domain
guard**: in real-provider mode, any send whose From domain differs from the
`NUXT_SMTP_USER` domain is refused before it reaches the provider. The guard is
off in Mailpit mode.

So the working setup is simply: **Billing sender email == `NUXT_SMTP_USER`**
(or at least the same domain).

## Docker note

`docker-compose.yml` defaults the container's SMTP host to the Mailpit sidecar,
but defers to your `.env` when you set it:

```yaml
- NUXT_SMTP_HOST=${NUXT_SMTP_HOST:-mailpit}
- NUXT_SMTP_PORT=${NUXT_SMTP_PORT:-1025}
```

So to test a real provider from inside Docker, set `NUXT_SMTP_HOST`/`PORT` (and
the auth lines) in `.env` and recreate the app:

```bash
docker compose up -d --force-recreate app
```

## Smoke test

A dev-only endpoint sends one message through the configured transport so you
can confirm auth, TLS, and the From guard line up **before** sending a real
invoice. It sends _as_ the authenticated account (so it passes the guard even
while your Billing sender is a different domain you can't yet authenticate as).

```bash
# send a test to yourself; ?to= overrides the recipient
curl -X POST 'http://localhost:3000/api/_dev/test-mail?to=you@example.com'
```

A success looks like:

```json
{
  "sentVia": "asmtp.mail.example.ch:465",
  "authenticated": true,
  "from": "hello@chohle.ch",
  "to": "you@example.com",
  "accepted": ["you@example.com"],
  "rejected": []
}
```

The endpoint is gated to dev (`import.meta.dev`) and 404s in production.

## Troubleshooting

- **`Refusing to send: From domain "@x" does not match the SMTP account "@y"`**
  The From-domain guard fired. Your Billing sender email and `NUXT_SMTP_USER`
  are on different domains. Align them — set the Billing sender to an address on
  the `NUXT_SMTP_USER` domain, or point `NUXT_SMTP_USER` at the mailbox that
  owns the Billing address.
- **`500 Server Error` when sending an invoice, but the smoke test works**
  Same cause as above: the smoke test sends as `NUXT_SMTP_USER` (passes), while
  the invoice sends as the Billing sender (may not). Check the two domains
  match.
- **Connection timeout / TLS error**
  Wrong host or port — you're probably pointing at the IMAP endpoint (`:993`).
  Use the provider's SMTP submission host; try `587` if `465` fails.
- **`535` authentication failed**
  Wrong `NUXT_SMTP_USER` / `NUXT_SMTP_PASS`, or the provider requires an app
  password.
- **Mail "sends" but never arrives**
  You're still in Mailpit mode (`NUXT_SMTP_USER` blank, or Docker is using the
  Mailpit default). Check http://localhost:8125 — if it's there, the app is
  talking to Mailpit, not your provider.
- **Sends suppressed with `[demo] outbound email suppressed`**
  The instance is running in demo mode (`CHOHLE_DEMO=true`); all outbound is
  intentionally swallowed. See [DEMO_MODE](DEMO_MODE.md).
