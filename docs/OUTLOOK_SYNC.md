# Outlook sync

Connects your **Microsoft 365 / Outlook** mailbox so replies to emails
you send from a project land back in the project's Conversations
thread automatically. This document covers the Outlook specific
setup. For the shared concepts (CHOHLE_SECRET, threading, what gets
synced, where to find it in the UI) see [MAIL_SYNC](MAIL_SYNC.md).

## Prerequisites

- `CHOHLE_SECRET` set on the running chohle instance (see
  [MAIL_SYNC](MAIL_SYNC.md#requirements)).
- An Azure tenant where you can register an app. Your own personal
  Microsoft account works for personal Outlook addresses.

## Step 1: register an Azure app

1. Sign in to https://entra.microsoft.com (Azure Portal) and go to
   **App registrations** → **New registration**.
2. Fill in:
   - **Name**: `chohle` (any name works, this is just for your reference).
   - **Supported account types**: pick the one matching where your
     mailbox lives.
     - _Accounts in this organizational directory only_ if you only
       want your own tenant.
     - _Accounts in any organizational directory and personal Microsoft
       accounts_ if you want it to work for any account.
   - **Redirect URI**: pick **Web** as the platform, and set the URI to
     your chohle callback. For local dev that is:

     ```text
     http://localhost:3000/api/auth/outlook/callback
     ```

     For a hosted chohle, swap in your domain.

3. Click **Register**.
4. From the app's **Overview** page, copy the **Application (client) ID**
   and the **Directory (tenant) ID**. You'll paste these into chohle.

## Step 2: grant API permissions

On the app registration page, go to **API permissions** →
**Add a permission** → **Microsoft Graph** → **Delegated permissions**
and add:

| Permission       | Why we need it                                                 |
| ---------------- | -------------------------------------------------------------- |
| `User.Read`      | Read your basic profile to capture the email address.          |
| `Mail.Read`      | Read your mailbox so the sync worker can find inbound replies. |
| `offline_access` | Issue a refresh token so the sync keeps working past one hour. |

Click **Grant admin consent** if your tenant requires it. PKCE means
no client secret is needed.

## Step 3: connect from chohle

1. Open chohle and go to **Settings → Mail sync**.
2. Click **Outlook / Microsoft 365**.
3. Paste the Client ID and Tenant ID you copied above.
4. Optionally set a label (defaults to your display name).
5. Click **Sign in with Microsoft**.
6. A Microsoft consent screen opens. Sign in and approve.
7. You're redirected back to chohle and the mailbox shows up in the
   connected list.

## Tenant ID shortcuts

You can paste one of these special values instead of your tenant UUID:

| Value           | Use case                                                |
| --------------- | ------------------------------------------------------- |
| `common`        | Personal Microsoft accounts and work / school accounts. |
| `organizations` | Work or school accounts only.                           |
| `consumers`     | Personal Microsoft accounts only.                       |

## Disconnecting

Settings → Mail sync → row → **Disconnect**. chohle forgets the tokens
locally. To revoke at Microsoft's side too, remove chohle from
[myapplications.microsoft.com](https://myapplications.microsoft.com).

## Outlook specific troubleshooting

- **"AADSTS50011: redirect URI mismatch"**: the redirect URI in your
  Azure app must exactly match the one chohle posts. Including the
  scheme, host, port, and path. Update the Azure app under
  **Authentication** → **Web** → **Redirect URIs**.
- **"AADSTS7000218: client_assertion or client_secret required"**:
  your Azure app is registered as a confidential client. PKCE only
  works with public clients. Either register the app as **Mobile and
  desktop applications**, or under **Authentication** enable
  _Allow public client flows_.
- **"Sign in failed"** generic: double check that Client ID is a UUID
  and that the Tenant ID matches the account type your app accepts.
  Personal Microsoft accounts need `common` or `consumers`; tenant
  bound apps need the actual tenant UUID or `organizations`.

For non Outlook troubleshooting (CHOHLE_SECRET, threading not matching,
manual Sync now button etc.) see [MAIL_SYNC](MAIL_SYNC.md#troubleshooting).
