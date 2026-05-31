# Gmail sync

Connects your **Google Workspace or personal Gmail** mailbox so replies
to emails you send from a project land back in the project's
Conversations thread automatically. This document covers the Gmail
specific setup. For the shared concepts (BATZE_SECRET, threading, what
gets synced, where to find it in the UI) see
[MAIL_SYNC](MAIL_SYNC.md).

## Prerequisites

- `BATZE_SECRET` set on the running batze instance (see
  [MAIL_SYNC](MAIL_SYNC.md#requirements)).
- A Google account with access to https://console.cloud.google.com so
  you can create a Google Cloud project and an OAuth client. Any
  Google account works, including personal `@gmail.com`.

## Step 1: create a Google Cloud project

1. Sign in to https://console.cloud.google.com.
2. Top bar → project picker → **New Project**.
3. Name it `batze` (any name works, just for your reference) and
   create. Make sure that project is selected in the top bar before
   continuing.

## Step 2: enable the Gmail API

1. Left menu → **APIs & Services** → **Library**.
2. Search for **Gmail API** and open it.
3. Click **Enable**.

## Step 3: configure the OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. **User type**:
   - **Internal** if your account is a Google Workspace admin and you
     only want users in your own workspace to connect.
   - **External** for personal `@gmail.com` accounts or anyone outside
     your workspace.
3. Fill in **App name** (`batze`), **User support email**, and
   **Developer contact** with your own email.
4. **Scopes**: add the three batze needs:

   | Scope                                            | Why                                                            |
   | ------------------------------------------------ | -------------------------------------------------------------- |
   | `https://www.googleapis.com/auth/gmail.readonly` | Read your mailbox so the sync worker can find inbound replies. |
   | `openid`                                         | Standard OpenID Connect identifier.                            |
   | `email`, `profile`                               | Capture the connected email address for the Settings list.     |

5. **Test users** (External + Testing only): add your own email. While
   the consent screen is in **Testing** state, only listed test users
   can sign in. You can leave it in Testing forever for personal use;
   only publish if you want others to be able to connect their own
   accounts to your batze instance.

## Step 4: create the OAuth client

1. **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID**.
2. **Application type**: **Web application**.
3. **Name**: `batze` (any name).
4. **Authorized redirect URIs**: add your batze callback. For local
   dev:

   ```text
   http://localhost:3000/api/auth/gmail/callback
   ```

   For a hosted batze, swap in your domain.

5. Click **Create**. A dialog shows your **Client ID** and **Client
   secret**. Copy both into batze. The secret is also visible later
   from the same Credentials page.

## Step 5: connect from batze

1. Open batze and go to **Settings → Mail sync**.
2. Click **Google / Gmail**.
3. Paste the Client ID and Client Secret you copied above.
4. Optionally set a label (defaults to your Google profile name).
5. Click **Sign in with Google**.
6. A Google consent screen opens. Sign in and approve the requested
   scopes.
7. You're redirected back to batze and the mailbox shows up in the
   connected list.

## Disconnecting

Settings → Mail sync → row → **Disconnect**. batze forgets the tokens
locally. To revoke at Google's side too, remove batze from
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Gmail specific troubleshooting

- **"Error 400: redirect_uri_mismatch"**: the redirect URI in your
  Google OAuth client must exactly match the one batze posts.
  Including the scheme, host, port, and path. Add the exact URL under
  **Credentials** → your client → **Authorized redirect URIs**.
- **"Access blocked: This app's request is invalid"** or
  **"Error 403: access_denied"**: your account is not on the
  **Test users** list while the consent screen is in Testing state.
  Add your email under **OAuth consent screen** → **Test users**, or
  publish the consent screen to Production.
- **"Error 401: invalid_client" on token exchange**: the Client
  Secret you pasted is wrong. Copy it again from **Credentials** →
  your client. Note that secrets are displayed only once at creation;
  if you lost it you can rotate it from the same page.
- **"Google did not return a refresh_token"**: batze always requests
  `access_type=offline` with `prompt=consent`, so this should not
  happen on a fresh consent. If it does, disconnect the mailbox and
  reconnect; Google will reissue a refresh token.

For non Gmail troubleshooting (BATZE_SECRET, threading not matching,
manual Sync now button etc.) see
[MAIL_SYNC](MAIL_SYNC.md#troubleshooting).
