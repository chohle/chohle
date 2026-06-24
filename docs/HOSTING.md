# Hosting chohle online (optional)

chohle is **local-first** — the normal way to use it is on your own machine
(`docker compose up`, see the [README](../README.md)). You do **not** need to
host it anywhere to use it.

This guide is only for when you want chohle reachable over the internet — for
example to run the **public demo** (see [Demo mode](DEMO_MODE.md)) or to reach
your own instance remotely. It uses one small Linux VPS with Docker + Caddy
(automatic HTTPS).

> **Don't use serverless hosts** (Vercel / Netlify / Cloudflare Workers). chohle
> is one long-lived Node process with a file-based SQLite database and background
> jobs — it needs a normal server with a persistent disk, not functions.

## 1. Pick a host

Anything that runs Docker works. A 2 GB VPS is comfortable (e.g. Hetzner CX22
~€4/mo, DigitalOcean, Linode). 1 GB also runs it, but `yarn build` is
memory-hungry — add swap (below) or build the image elsewhere.

## 2. DNS

Point an **A record** for your domain (e.g. `app.example.com`) at the VPS IP
_before_ deploying — Caddy needs it to issue the TLS certificate. Open ports
**80** and **443**. (If you front it with Cloudflare's proxy, see "Behind a
proxy" at the bottom.)

## 3. Server setup

```sh
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh

# 1 GB box only: 2 GB swap so the build doesn't OOM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

git clone https://github.com/chohle/chohle.git chohle && cd chohle
```

## 4. Configure

```sh
cp .env.example .env
```

Set, at minimum:

| Variable                                      | Notes                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `DOMAIN`                                      | e.g. `app.example.com` — Caddy gets the cert for this                   |
| `CHOHLE_SECRET`                               | random 32+ chars (at-rest encryption key) — `openssl rand -hex 32`      |
| `NUXT_SESSION_PASSWORD`                       | random 32+ chars (seals the session cookie)                             |
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | owner login                                                             |
| `CHOHLE_DEMO`                                 | `true` only if this is a public demo (see [Demo mode](DEMO_MODE.md)) |

## 5. Launch

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

First boot builds the image (native `better-sqlite3` compiles), Caddy fetches a
Let's Encrypt cert, and the app comes up at `https://<DOMAIN>`.

```sh
docker compose -f docker-compose.prod.yml logs -f          # follow logs
docker compose -f docker-compose.prod.yml ps               # container status
```

## 6. Updating

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build     # rebuild, not just restart
```

A plain restart reuses the old image — code changes need `--build`.

## Notes

- **Data persistence.** The database, uploads, and (in demo mode) the per-session
  sandboxes live in the `appdata` named volume. `docker compose ... down` keeps
  it; `down -v` wipes it.
- **SQLite + volumes.** On a Linux host a normal Docker volume is safe for
  SQLite. (The compose deliberately keeps the db on a _named volume_, not a
  macOS bind mount, which corrupts SQLite — see `docker-compose.yml`.)
- **Backups.** A backup of the `appdata` volume (or the `data/` folder for a
  local install) is a backup of everything.

## Behind a proxy (Cloudflare)

If you proxy the domain through Cloudflare (orange-cloud) to hide the origin IP,
Caddy can't use the default HTTP challenge. The simplest setup: change the
`Caddyfile` site block to use `tls internal` and set Cloudflare's SSL/TLS mode to
**Full**. Cloudflare then serves the public cert and talks to Caddy over its
self-signed one. (Grey-cloud / "DNS only" is the no-extra-config alternative, but
it exposes the server IP.)
