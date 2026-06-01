# Mahnungen (overdue payment reminders)

batze can send escalating reminders for overdue invoices. Three
levels per Swiss practice: **1. Mahnung**, **2. Mahnung**, **letzte
Mahnung** (1st reminder, 2nd reminder, final notice).

Each reminder generates a fresh invoice PDF from the current invoice
rows and attaches it, so any corrections since the original send
reach the customer. Subject + body come from a level specific
template you can edit per workspace.

## Where to find it

- **Sidebar → Finance → Reminders** opens the Mahnungen page.
- The page splits overdue invoices into two groups:
  - **Ready to send**: the next reminder level's wait window has
    elapsed; clicking **Preview** shows what the customer will see,
    and **Send reminder** in the modal fires it.
  - **Waiting**: still inside the wait window or all three levels
    already sent. Each row shows when it becomes ready, or marks it
    as exhausted if there's no level left.

## How eligibility works

A reminder for level N is eligible when:

- **Level 1**: today is at least `reminder1_wait_days` after the
  invoice `due_date`.
- **Level 2**: today is at least `reminder2_wait_days` after the
  level 1 reminder's `sent_at`.
- **Level 3**: today is at least `reminder3_wait_days` after the
  level 2 reminder's `sent_at`.

Wait days are configured in **Settings → Reminders** and default to
`7 / 14 / 30`. An invoice with status `paid` or `draft` is never
eligible; only `sent` invoices with a `due_date` in the past show
up.

## Templates

**Settings → Reminders** has one card per level with three fields:

- **Wait days**: how long to wait before this level becomes
  eligible. Range 0..365.
- **Subject**: the email subject line.
- **Body**: the email body. Plain HTML works (paragraphs, line
  breaks, bold). Header and footer are added automatically when
  sending, just like the cover message template for invoices.

### Placeholders

Filled in at send time:

| Placeholder      | Replaced with                                       |
| ---------------- | --------------------------------------------------- |
| `{customer}`     | Customer name from the invoice.                     |
| `{number}`       | Invoice number.                                     |
| `{amount}`       | Invoice total in CHF, Swiss formatted (`1'250.00`). |
| `{issued}`       | Invoice issue date (`YYYY-MM-DD`).                  |
| `{due}`          | Invoice due date (`YYYY-MM-DD`).                    |
| `{days_overdue}` | Whole calendar days since the due date.             |
| `{sender}`       | Your sender name from the Billing page.             |

Identical placeholders work across all three levels; nothing stops
you from using `{days_overdue}` in level 1 either if you find it
useful.

## What gets sent

Each reminder is one email:

- **From**: your sender name + email (or `no-reply@batze.local` if
  the sender has no email set).
- **To**: the customer's email address (required).
- **Subject + body**: rendered from the level template.
- **Attachment**: the original invoice PDF, regenerated fresh so it
  always reflects the current invoice rows.

Before sending, batze validates that your sender block has a valid
IBAN and a complete street / zip / city. That's the same gate as
the regular invoice send because the PDF needs them for the QR
slip.

## History

Every sent reminder is logged in the `invoice_reminders` table with
the level, the rendered subject + body, and the timestamp. The
Mahnungen page uses this to compute eligibility; the count of
existing reminders also drives the auto picked next level.

## Manual override

The default workflow is: open the Mahnungen page, find a Ready row,
click Preview, click Send. The Send endpoint auto picks the next
level based on history.

If you need to escalate immediately or resend a level, call the
endpoint directly with an explicit `level` in the body:

```sh
curl -X POST http://localhost:3000/api/invoices/42/remind \
  -H 'Content-Type: application/json' \
  -d '{"level": 2}'
```

batze will skip the auto pick and use the level you specified.

## Not in this version

These are real Swiss SME use cases that would build on top of this
foundation but are intentionally out of scope for v1:

- **Reminder fees (Mahngebühren)**: most freelancers skip them; legally
  they only apply when explicitly agreed in the contract / AGB.
- **Auto fire on a schedule**: today reminders are manual button
  presses. A daily background worker that auto sends due reminders
  is straightforward to add on top of the existing eligibility
  check.
- **Per customer cadence overrides**: today wait days are workspace
  wide. A per customer override (e.g. a forgiving customer gets 14 /
  30 / 60 instead of 7 / 14 / 30) is a future enhancement.
