# Deploying chohle (VPS + Docker + Caddy)

A single small Linux VPS runs the app and Caddy (automatic HTTPS). This suits
the app's shape: one long-lived Node process, a file-based SQLite database on a
persistent volume, and the demo's per-session sandboxes. **Do not** use
serverless hosts (Vercel/Netlify/Cloudflare) — the native SQLite module,
persistent file, and background jobs don't fit there.

## 1. Pick a host

Anything with Docker works. A 2 GB VPS is comfortable (Hetzner CX22 ~€4/mo,
DigitalOcean, Linode…). 1 GB also runs it, but `yarn build` is memory-hungry —
add swap (below) or build the image elsewhere.

## 2. DNS

Point an **A record** for your domain (e.g. `demo.example.com`) at the VPS IP
*before* deploying — Caddy needs it to issue the TLS certificate. Open ports
**80** and **443** in the firewall.

## 3. Server setup

```sh
# Install Docker (official convenience script) + compose plugin
curl -fsSL https://get.docker.com | sh

# 1 GB box only: add 2 GB swap so the build doesn't OOM
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile

git clone <your-repo-url> chohle && cd chohle
git checkout feat/demo-mode        # the branch with demo mode
```

## 4. Configure

```sh
cp .env.example .env
```

Edit `.env` and set, at minimum:

| Variable | Notes |
| --- | --- |
| `DOMAIN` | e.g. `demo.example.com` — Caddy gets the cert for this |
| `CHOHLE_DEMO` | `true` for the public demo |
| `CHOHLE_SECRET` | random 32+ chars (at-rest encryption key) |
| `NUXT_SESSION_PASSWORD` | random 32+ chars (seals the session cookie) |
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | owner login (unused while in demo mode, but set them) |

Generate a secret: `openssl rand -hex 32`.

## 5. Launch

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

First boot: the image builds (native `better-sqlite3` compiles), Caddy fetches
a Let's Encrypt cert, and the app comes up. Visit `https://<DOMAIN>`.

Useful:

```sh
docker compose -f docker-compose.prod.yml logs -f app    # app logs
docker compose -f docker-compose.prod.yml logs -f caddy  # cert / proxy
docker compose -f docker-compose.prod.yml up -d --build   # redeploy after a pull
```

## 6. Updating

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Notes

- **Data persistence.** The db, uploads, and demo sandboxes live in the
  `appdata` named volume. For a public demo the data is disposable; the volume
  just lets sandboxes survive a redeploy. `docker compose ... down` keeps it;
  `down -v` wipes it.
- **Demo housekeeping.** Each visitor's sandbox is a small SQLite copy; idle
  ones (default 2 h) and anything past the 500-session cap are evicted
  automatically. Tune with `DEMO_SESSION_TTL_MS` / `DEMO_MAX_SESSIONS`.
- **Turning demo off** (run it as the real single-tenant app): set
  `CHOHLE_DEMO=false`, configure real SMTP (`NUXT_SMTP_HOST/PORT`), then
  redeploy. Mailpit is dev-only and not part of this prod stack.
