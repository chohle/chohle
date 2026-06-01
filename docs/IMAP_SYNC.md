# IMAP sync

Connects any mailbox that speaks IMAP4rev1 (including **Proton Mail
via Bridge, Fastmail, iCloud Mail, and self hosted servers**) so
replies to emails you send from a project land back in the project's
Conversations thread automatically. This document covers the IMAP
specific setup. For the shared concepts (CHOHLE_SECRET, threading,
what gets synced, where to find it in the UI) see
[MAIL_SYNC](MAIL_SYNC.md).

Use this provider if your mailbox is anything other than Microsoft
365 / Outlook or Gmail / Google Workspace. Those two have dedicated
OAuth integrations and should use [OUTLOOK_SYNC](OUTLOOK_SYNC.md) or
[GMAIL_SYNC](GMAIL_SYNC.md) instead.

## Prerequisites

- `CHOHLE_SECRET` set on the running chohle instance (see
  [MAIL_SYNC](MAIL_SYNC.md#requirements)). The mailbox password is
  encrypted at rest with the key derived from this secret.
- IMAP access enabled on your mailbox. For some providers this is
  off by default; the per provider sections below say how to turn it
  on.
- An app password if your provider supports them. Use one instead of
  your login password whenever possible; revoking just the app
  password is cleaner than rotating your real one.

## Provider settings

Pick the row that matches your mailbox. The values go straight into
the chohle Connect IMAP modal.

### Proton Mail (via Proton Bridge)

Proton does not expose IMAP directly. You need [Proton
Bridge](https://proton.me/mail/bridge) running locally on your
machine; Bridge proxies your encrypted mailbox over a plain IMAP
endpoint on `localhost`. Open Bridge → your account → **Mailbox
configuration**:

| Setting  | Value                                                   |
| -------- | ------------------------------------------------------- |
| Host     | `127.0.0.1`                                             |
| Port     | The IMAP port Bridge shows (usually `1143`, not `993`). |
| Username | Your Proton email.                                      |
| Password | The Bridge **app password** Bridge generated for you.   |

Bridge has to be running on the same machine as chohle for the sync
worker to reach it.

### Fastmail

Fastmail requires an app password for IMAP; your login password is
rejected.

1. Sign in at https://app.fastmail.com.
2. **Settings → Privacy & Security → App passwords → New app
   password**. Name it `chohle`, give it **Mail (IMAP / POP / SMTP)**
   access.
3. Copy the generated password.

| Setting  | Value                           |
| -------- | ------------------------------- |
| Host     | `imap.fastmail.com`             |
| Port     | `993`                           |
| Username | Your full Fastmail email.       |
| Password | The app password you just made. |

### iCloud Mail

iCloud requires a Sign in with Apple **app specific password**; your
Apple ID password is rejected.

1. Sign in at https://account.apple.com.
2. **Sign In and Security → App Specific Passwords → Generate an
   app specific password**. Label it `chohle`.
3. Copy the generated password.

| Setting  | Value                                              |
| -------- | -------------------------------------------------- |
| Host     | `imap.mail.me.com`                                 |
| Port     | `993`                                              |
| Username | Just the part before `@icloud.com` (Apple's rule). |
| Password | The app specific password you just made.           |

### Custom / self hosted IMAP

Anything that speaks IMAP4rev1 works. Common defaults:

| Setting  | Value                                                                                        |
| -------- | -------------------------------------------------------------------------------------------- |
| Host     | Your server's IMAP hostname.                                                                 |
| Port     | `993` (implicit TLS) is preferred. `143` works with STARTTLS where the server advertises it. |
| Username | Whatever your server expects (usually the email address).                                    |
| Password | The mailbox password.                                                                        |

Plain text IMAP without TLS is intentionally rejected.

## Connect from chohle

1. Open chohle and go to **Settings → Mail sync**.
2. Click **IMAP (Proton, Fastmail, iCloud, …)**.
3. Paste the Host, Port, Username, and Password from the relevant
   provider section above.
4. Optionally set a label (defaults to the username or email).
5. Click **Test and connect**. chohle opens a real IMAP session and
   logs in once to verify the credentials before saving.
6. On success the mailbox shows up in the connected list.

If the test login fails, the modal stays open with the IMAP server's
error message in a toast so you can correct the values and retry.

## Disconnecting

Settings → Mail sync → row → **Disconnect**. chohle forgets the
encrypted password locally. To revoke at the provider side, delete
the relevant app password from the provider's own dashboard.

## IMAP specific troubleshooting

- **"Invalid credentials" / "AUTHENTICATIONFAILED"**: double check
  Username and Password. For Fastmail, iCloud, and Google Workspace
  it must be an app password, not your login password. For Proton it
  must be the Bridge app password, not your Proton account password.
- **"ENOTFOUND" or "ECONNREFUSED"**: the Host is wrong, the Port is
  wrong, or the server isn't reachable from where chohle runs. For
  Proton Bridge, confirm Bridge is running and listening on
  `localhost` from inside the chohle container too if you're using
  Docker (you may need `host.docker.internal`).
- **"Certificate has expired" / TLS handshake errors**: your server
  is using a self signed or expired certificate. chohle does not
  accept those by default; either fix the certificate, or contact
  the provider.
- **Sync ran but nothing appeared in the thread**: the reply's
  headers didn't reference a Message-ID chohle captured. Confirm the
  email was originally sent from chohle (not from your normal mail
  client) and that the reply is a true reply (not a forwarded new
  message that strips the headers).

For non IMAP troubleshooting (CHOHLE_SECRET, threading not matching,
manual Sync now button etc.) see
[MAIL_SYNC](MAIL_SYNC.md#troubleshooting).
