# Quick start: run chohle locally

This walks through every step to get chohle running on your own machine, from nothing to
a logged-in app. It should take about five minutes. Everything runs in Docker, so you do
not need Node or Yarn installed on your host.

If you only want the three commands, they are at the [bottom](#tldr). Otherwise, follow
along.

## 1. Install the prerequisites

You need two things:

- **[Docker](https://docs.docker.com/get-docker/)** and **Docker Compose**. Docker
  Desktop (macOS / Windows) includes Compose. On Linux, install Docker Engine plus the
  Compose plugin.
- **[git](https://git-scm.com/downloads)**, to clone the repository.

Check they are ready:

```bash
docker --version
docker compose version
git --version
```

If `docker compose version` errors, your Docker is too old. Update Docker Desktop or
install the Compose plugin.

## 2. Get the code

```bash
git clone https://github.com/chohle/chohle.git
cd chohle
```

Every command from here on is run from inside this `chohle` folder.

## 3. Create your configuration

chohle reads its settings from a `.env` file, which is not committed. Copy the example to
create your own:

```bash
cp .env.example .env
```

Now open `.env` in an editor and set three values before first launch:

| Variable                | Set it to                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `NUXT_ADMIN_USERNAME`   | The login name for the single owner account (e.g. your name).         |
| `NUXT_ADMIN_PASSWORD`   | A password you choose. This is your login; don't leave `change-me`.   |
| `NUXT_SESSION_PASSWORD` | A random string, **32+ characters**. It seals your session cookie.    |

Generate a strong session secret with:

```bash
openssl rand -base64 32
```

Paste the output as `NUXT_SESSION_PASSWORD`. Leave the SMTP lines commented out: in
Docker, email is automatically routed to the bundled Mailpit catcher, so you don't need a
real mail server to start.

> The admin username and password seed the owner account **on the very first launch**.
> If you change them later, change them in the app (Profile), not just in `.env`.

## 4. Start it

```bash
docker compose up
```

The first run builds the app image and installs dependencies, so it takes a few minutes.
You'll know it's ready when the logs show Nuxt listening on port 3000. On startup chohle
also applies its database migrations and seeds your owner account automatically. There
is no separate setup step.

To run it in the background instead, add `-d` (`docker compose up -d`).

## 5. Open the app and log in

- **App:** [http://localhost:3000](http://localhost:3000), log in with the
  `NUXT_ADMIN_USERNAME` and `NUXT_ADMIN_PASSWORD` you set in step 3.
- **Mailpit (dev email):** [http://localhost:8125](http://localhost:8125). Every email
  chohle "sends" in development lands here instead of a real inbox, so you can preview
  invoices, quotes, and reminders.

## 6. (Optional) Load demo data

To explore with realistic content (categories, six months of expenses, income,
customers, articles, and invoices), seed the database once the app is running:

```bash
docker compose exec app yarn seed
```

This keeps your owner login and fills the business tables. Skip it if you'd rather start
empty.

## 7. Stopping and restarting

- **Stop:** press `Ctrl+C` in the terminal running it (or `docker compose down` if you
  used `-d`). Your data is safe: it lives in a Docker volume and the `data/` folder.
- **Start again:** `docker compose up`. Subsequent starts are fast; the image is already
  built.

## Next steps

- The full [development guide](DEVELOPMENT.md) covers environment variables, the
  database and migrations, adding dependencies, and the project structure.
- Browse what chohle can do in the [features documentation](features/).
- Connecting a real inbox or outbound mail server: [Mail sync](MAIL_SYNC.md) and
  [Sending email](SENDING_EMAIL.md).

## Troubleshooting

- **`command not found: nuxt` (the app exits with code 127).** A stale `node_modules`
  Docker volume. Reset it with `docker compose down -v` then `docker compose up --build`.
  The full explanation is in the development guide's
  [troubleshooting section](DEVELOPMENT.md#troubleshooting).
- **Port 3000 or 8125 already in use.** Another process holds the port. Stop it, or
  change the host port mappings in `docker-compose.yml`.

## TL;DR

```bash
git clone https://github.com/chohle/chohle.git
cd chohle
cp .env.example .env          # then set the admin + session secrets (step 3)
docker compose up             # app on :3000, Mailpit on :8125
```
