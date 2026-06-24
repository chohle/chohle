# Email (Conversations & Triage)

chohle pulls inbound mail from your connected mailboxes, threads each
message onto the project it belongs to, and parks anything it can't
place into a review queue. The whole experience is read-and-assign in
app; account connection and SMTP setup live in their own guides
(linked under [Backed by](#backed-by)).

## Where to find it

- **Sidebar -> Workspace -> Conversations** (route `/conversations`,
  mail icon `i-lucide-mail`) — a two pane view: a list of projects
  that have at least one email on the left, the selected project's
  thread on the right.
- **Sidebar -> Workspace -> Triage** (route `/triage`, inbox icon
  `i-lucide-inbox`, with a **pending-count badge**) — inbound mail
  that didn't thread to any project, waiting for a human to file or
  drop it. The badge shows the number of `pending` rows and stays in
  lockstep with the page via `useTriageCount()`.

## How inbound mail threads to a project

Threading is header based and deliberately conservative — nothing
attaches to a project automatically except a real reply to mail we
sent.

- Every outbound email is sent with a chohle-generated RFC 5322
  Message-ID (`<chohle-<uuid>@<your-domain>>`), set explicitly so
  relays can't rewrite it, and stored on the `project_emails` row in
  `message_id`.
- On sync each inbound message's `In-Reply-To` / `References` headers
  are matched against those stored Message-IDs. A hit files the
  message under that project (direction `inbound`); a freshly inserted
  inbound message also becomes an anchor, so later replies in the same
  batch thread too.
- The unique partial index on `project_emails.message_id` (migration
  `0035_project_emails_message_id_unique`) plus `INSERT OR IGNORE`
  dedups, so re-syncing the same window never doubles a message.

In the right pane the thread is grouped by normalized subject
(`groupEmailsBySubject`, stripping `Re:`/`Fwd:`/`Aw:`/`Wg:`), so a
reply sits under the mail it answers. A segmented filter switches
between all / received / sent. The header links through to the full
[project](projects.md) detail page, which owns quotes, invoices and
budget alongside the conversation.

## The triage queue

When an inbound message matches no stored Message-ID (cold inbound, or
a reply whose threading headers were stripped), the sync driver does
**not** drop it and does **not** guess a project. It parks the message
in `inbound_triage` with `status = 'pending'` and a non-binding
suggestion:

- `suggestProject()` does an exact, case-insensitive match of the
  sender address against `customers.email`. On a hit it suggests that
  customer's single most-recently-touched non-completed project.
- The suggestion is stored in `suggested_customer_id` /
  `suggested_project_id` but **never auto-applied**.

Each card on `/triage` shows the sender, subject, a 180-char snippet,
and the suggestion chip. Three actions:

- **Assign to suggested** (`POST /api/triage/{id}/assign`) — files the
  message into `project_emails`. It also sweeps in the rest of that
  back-and-forth: other `pending` rows with the same sender and same
  normalized subject move together. The moved triage rows are
  tombstoned `status = 'assigned'`; their Message-IDs then act as
  thread anchors so future replies match automatically.
- **Choose project…** — lazy-loads the suggested customer's projects
  and hands off to the shared `ProjectPicker` (which can also create a
  new project), then assigns to the chosen one. Shown only when a
  customer was matched.
- **Dismiss** (`POST /api/triage/{id}/dismiss`) — marks the row
  `status = 'dismissed'`. The tombstone is kept so the next sync
  doesn't re-triage the same Message-ID.

Both actions refresh the list and the sidebar badge.

## Sending replies

The conversation pane doesn't host a composer of its own. The Reply
button on an inbound message jumps to the project detail
(`/<sales|procurement>/<id>?reply=<id>`), whose composer opens
pre-filled for that message — keeping one send path.

Sending (`POST /api/projects/{id}/emails`) wraps the body in the
shared branded shell (`buildBrandedEmail`, optional signature slot),
sends via the configured SMTP transport (`getMailer()`), and logs the
raw body back onto `project_emails` as an `outbound` row with its own
Message-ID — which becomes the anchor that threads the customer's
reply. The recipient defaults to the linked customer's email; the
sender comes from the Billing sender record. There's also a
`log.post.ts` endpoint to record a reply sent outside chohle (no
Message-ID, so it stays manual).

See [Sending email](../SENDING_EMAIL.md) for SMTP configuration and
the branded template.

## The provider sync model

Mailboxes live in the `mailboxes` table; `provider` is one of
`gmail`, `outlook`, `imap` (enforced by a CHECK constraint).

| Provider  | Auth                              | Driver                          |
| --------- | --------------------------------- | ------------------------------- |
| `gmail`   | Google OAuth (tokens stored encrypted) | `server/utils/gmailSync.ts`   |
| `outlook` | Microsoft Graph OAuth             | `server/utils/outlookSync.ts`   |
| `imap`    | host / user / encrypted password  | `server/utils/imapSync.ts`      |

Each driver fetches a bounded recent window (capped at 200 messages
per run), dedups against already-handled Message-IDs
(`loadHandledInboundIds`), threads or triages each message, then
stamps `last_sync_at` / `last_error` on the mailbox. They run on a
background tick (`server/plugins/03.mail-sync.ts`); the same code path
is exposed as a manual **Sync now** (`POST /api/mailboxes/{id}/sync`),
which surfaces sync errors as a 502 with the driver's message.

Connection and per-provider setup are out of scope here — see:

- [Mail sync overview](../MAIL_SYNC.md)
- [Gmail](../GMAIL_SYNC.md) · [Outlook](../OUTLOOK_SYNC.md) ·
  [IMAP](../IMAP_SYNC.md)

## Backed by

- Migrations: `0030_email_sync_scaffolding` (adds
  `project_emails.message_id` + the `mailboxes` table with the
  gmail/outlook/imap CHECK), `0031_mailboxes_provider_app_ids`,
  `0032_mailboxes_provider_client_secret`,
  `0035_project_emails_message_id_unique`, `0036_inbound_triage`.
- Endpoints: `server/api/conversations/index.get.ts`,
  `server/api/projects/[id]/emails/` (list / send / log),
  `server/api/triage/` (`index`, `count`, `[id]/assign`,
  `[id]/dismiss`), `server/api/mailboxes/` (`index`, `[id]` delete,
  `[id]/sync`).
- Sync + triage utils: `server/utils/triage.ts` (`suggestProject`,
  `triageInbound`, `loadHandledInboundIds`, `stripReplyPrefix`),
  `server/utils/gmailSync.ts`, `server/utils/outlookSync.ts`,
  `server/utils/imapSync.ts`; background `server/plugins/03.mail-sync.ts`.
- Pages: `app/pages/conversations.vue`, `app/pages/triage.vue`;
  badge via `app/composables/useTriageCount.ts`.
- Tests: `test/gmailSync.test.ts`, `test/outlookSync.test.ts`,
  `test/imapSync.test.ts`.
