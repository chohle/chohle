# Mail sync

chohle can connect to your mailbox and automatically pull replies to
emails you sent from a project back into that project's Conversations
thread. No copy paste, no forwarding rules, no manual logging.

This page covers the shared concepts. **For the per provider one time
setup** (Azure app, Google Cloud project, IMAP credentials, etc.) see:

| Provider                                  | Status    | Setup guide                     |
| ----------------------------------------- | --------- | ------------------------------- |
| Microsoft 365 / Outlook                   | Available | [OUTLOOK_SYNC](OUTLOOK_SYNC.md) |
| Gmail / Google Workspace                  | Available | [GMAIL_SYNC](GMAIL_SYNC.md)     |
| IMAP (Proton Bridge, Fastmail, iCloud, …) | Available | [IMAP_SYNC](IMAP_SYNC.md)       |

## Requirements

- `CHOHLE_SECRET` environment variable (16+ random characters) set on
  the running chohle instance.

  ```env
  CHOHLE_SECRET=please-replace-with-32-bytes-of-random
  ```

  OAuth tokens and IMAP passwords are encrypted at rest (AES-256-GCM)
  with a key derived from this secret. It can be rotated without
  reconnecting anything, see [Rotating CHOHLE_SECRET](#rotating-chohle_secret).

- For OAuth providers (Outlook, Gmail), chohle runs the PKCE flow.
  Outlook works secret free; Google's Web OAuth client also requires
  a client secret on token exchange, which chohle stores encrypted at
  rest. The user is the only one with the credentials; chohle keeps
  only the tokens that result from a consented sign in.

## Where to find it

- **Settings → Mail sync** lists all your connected mailboxes and
  lets you connect a new one.
- **Settings → Mail sync → row → Sync now** runs a sync immediately
  for that mailbox and shows how many new replies it imported.
- **Settings → Mail sync → row → Disconnect** forgets the local
  tokens. To revoke at the provider side, do that from the provider's
  own apps dashboard.

## How threading works

chohle never imports your whole inbox. A message only lands in a
project thread when its email headers match a message chohle sent.

1. When you send an email from a project, the SMTP server assigns a
   `Message-ID` (the RFC 5322 unique id, usually
   `<random@your-domain>`). chohle captures it and stores it on the
   outbound row.
2. When the recipient hits reply, their mail client copies that
   Message-ID into the `In-Reply-To` and `References` headers of
   their response.
3. The sync worker (one per provider) pulls new messages from your
   inbox. For each one it extracts the anchor ids from those two
   headers.
4. If any anchor matches a Message-ID chohle stored on an outbound
   row, the worker inserts the message as an **inbound** row on the
   same project. Otherwise the message is ignored.

The match is deterministic: no false positives, no whole inbox slurp.
A reply that strips the headers (rare, but some forwarding setups
do) won't thread; the user can paste it manually with the existing
**Log a reply** button as a safety net.

The worker dedupes by the provider's own `internetMessageId`, so
running Sync now multiple times in a row never duplicates a row.

## How often it runs

A background worker ticks every five minutes by default. You can
change the interval with `CHOHLE_MAIL_SYNC_INTERVAL_MS` (milliseconds)
on the running instance. The first run fires roughly thirty seconds
after boot so the rest of the app has time to come up.

You can always force a sync from the Settings list with **Sync now**.

## Rotating CHOHLE_SECRET

Stored secrets carry a `v1:` format prefix and chohle can read rows
encrypted with a previous key while you switch over:

1. Generate a new value (`openssl rand -hex 32`).
2. Set `CHOHLE_SECRET` to the new value and `CHOHLE_SECRET_PREVIOUS` to
   the old one (comma separate several old keys if you skipped a step).
3. Restart chohle. On boot it re-encrypts every mailbox token, IMAP
   password and bank connection config with the new key and logs
   `[secrets] key rotation: re-encrypted N of N stored secret(s)`.
4. Once the log says every stored secret uses the current key, remove
   `CHOHLE_SECRET_PREVIOUS` and restart again.

A row that matches neither key is left untouched and listed in the log;
reconnect that mailbox or bank connection. Without
`CHOHLE_SECRET_PREVIOUS`, changing `CHOHLE_SECRET` still invalidates
every stored secret, exactly as before.

## Troubleshooting

- **`CHOHLE_SECRET environment variable must be set`**
  Add a 16+ char random string to your environment (or `.env` /
  `docker-compose.yml`) and restart chohle.
- **The sync ran but nothing appeared in the thread**
  The reply's headers didn't reference a Message-ID chohle captured.
  Confirm the email was originally sent from chohle (not from your
  normal mail client) and that the recipient's reply is a true reply
  (not a forwarded new message that strips the headers).
- **Mailbox row shows a red error message**
  The last sync attempt failed with that message. Common causes:
  the access token couldn't be refreshed (reconnect the mailbox),
  the provider's API is rate limiting (it'll retry on the next
  tick), or the provider revoked the consent (reconnect).

Provider specific troubleshooting lives in each provider's own doc.
