# Bankabgleich (CAMT.053 bank reconciliation)

> **Status: Phases 1–3 built (backend + UI) + Phase 5 auto-ingest
> (architecture + working folder provider; EBICS provider pending). Phase 4
> (partial-payment polish) pending.** This document is the implementation
> plan and the record of the design decisions behind the build. See the
> Phasing section for what's done.

chohle's pitch is "I sent the invoice → I got paid," but today marking an
invoice paid is a manual click. This feature closes that loop: import a
`camt.053` bank statement, match incoming payments to open invoices by
their Swiss QR reference, and mark the matched invoices paid
automatically.

## How the established tools (bexio) do it

For context, this is bexio's workflow:

1. **Two ingest paths** — connect the bank (nightly pull) or upload a
   `camt.053` file from e-banking. Manual import accepts **only**
   SPS-2022 (`camt.053.001.08`) and SPS-2021 (`camt.053.001.04`); newer
   exports (e.g. Wise's `.001.10`) are rejected outright.
2. **Automatic matching** by the structured QR/ISR reference, with
   `EndToEndId` as a secondary key.
3. **Suggestions, not silent writes** — payments are _suggested_ against
   invoices; the user confirms with a click. This holds even for a clean
   reference match: bexio never auto-books. Partial and collective
   postings are handled as explicit "few clicks" cases.
4. **Mark paid on confirm** using the booking/value date.
5. **Unmatched → manual queue**.

Sources: [bexio Banking](https://www.bexio.com/en-CH/banking),
[bexio ISO 20022](https://www.bexio.com/en-CH/iso20022),
[camt.053 structure (ValidateFin)](https://validatefin.com/en/blog/camt053-bank-statement).

## The chohle advantage: deterministic matching

bexio must match _fuzzily_ because it does not control how the reference
was generated. chohle does. The QR reference is derived deterministically
from `sender.iban + invoice.id`
(`server/utils/invoicePdf.ts`, `server/api/invoices/[id]/qrbill.get.ts`):

- **QR-IBAN → QRR**: `String(id).padStart(26, '0') + checksum` (27 digits)
- **regular IBAN → SCOR**: `RF + checksum + id`

So matching is: **reverse the encoding → recover the exact invoice ID**.
Any payment made by scanning chohle's own QR-bill matches deterministically
— effectively 100 %. Fuzzy matching (amount + debtor) is only the
_fallback_ for payments made without the reference.

### Prerequisite refactor

The reference is currently computed inline in two places
(`invoicePdf.ts:91`, `qrbill.get.ts:76`). Extract it into a single
`server/utils/qrReference.ts` exposing:

```ts
export function buildReference(invoiceId: number, iban: string): string
export function parseReference(ref: string): number | null // → invoice id, or null
```

Both the PDF generator and the matcher use it, so they can never drift.
Unit-test the round-trip (`parse(build(id)) === id`) for both QRR and SCOR.

## Design decisions (locked)

- **Auto-mark on exact match — a deliberate divergence from bexio.** When
  the reference resolves to an invoice _and_ the amount equals the
  invoice's live total, the invoice flips to `paid` automatically on
  import (booking date as `paid_at`). Partial and fuzzy matches still
  queue for manual confirmation. Note bexio never auto-books — it
  _suggests_ even on a clean reference match. We diverge because the
  deterministic reference (see above) removes the ambiguity bexio's
  confirm-step guards against. The residual risks that step would catch —
  a customer reusing an old QR-bill, paying the wrong invoice, or a bad
  parse yielding a collision — are accepted in v1 and revisited if they
  show up in practice.
- **Partials deferred (v1).** v1 handles exact and fuzzy _single-invoice_
  matches. Partial payments and one-payment-many-invoices (collective
  postings) only surface as suggestions to resolve by hand. No
  balance-tracking column yet.

## Data model

Two new migrations in `server/utils/migrate.ts`, following the append-only
`NNNN_name` convention (next free is `0035`). New tables, so no `fkOff`.

```
0035_bank_imports
  bank_imports
    id            INTEGER PRIMARY KEY AUTOINCREMENT
    filename      TEXT NOT NULL
    iban          TEXT NOT NULL          -- statement account; validate == sender.iban
    statement_id  TEXT                   -- camt <Stmt><Id>
    from_date     TEXT
    to_date       TEXT
    tx_count      INTEGER NOT NULL DEFAULT 0
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))

0036_bank_transactions
  bank_transactions
    id            INTEGER PRIMARY KEY AUTOINCREMENT
    import_id     INTEGER NOT NULL REFERENCES bank_imports(id) ON DELETE CASCADE
    booking_date  TEXT NOT NULL          -- Ntry/BookgDt/Dt
    value_date    TEXT                   -- Ntry/ValDt/Dt
    amount_rappen INTEGER NOT NULL       -- always credit (CRDT) for our use
    currency      TEXT NOT NULL DEFAULT 'CHF'
    reference     TEXT                   -- CdtrRefInf/Ref (raw)
    end_to_end_id TEXT
    debtor_name   TEXT
    acct_svcr_ref TEXT                   -- AcctSvcrRef, bank's unique tx id
    dedupe_hash   TEXT NOT NULL          -- hash(acct_svcr_ref || booking_date || amount || reference)
    status        TEXT NOT NULL DEFAULT 'unmatched'
                    CHECK (status IN ('unmatched','suggested','matched','ignored'))
    invoice_id    INTEGER REFERENCES invoices(id) ON DELETE SET NULL
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  CREATE UNIQUE INDEX idx_bank_tx_dedupe ON bank_transactions(dedupe_hash);
```

The unique `dedupe_hash` makes re-importing an overlapping statement safe
(camt.053 files overlap at period boundaries): insert with `INSERT OR IGNORE`.

## camt.053 parser — `server/utils/camt.ts`

- Add **`fast-xml-parser`** to `package.json` (zero native deps; fits the
  otherwise-pure stack alongside better-sqlite3). No XML parser exists today.
- Parse `Document/BkToCstmrStmt/Stmt`: read `Acct/Id/IBAN`, statement `Id`,
  `FrToDt`. For each `Ntry`:
  - keep only `CdtDbtInd === 'CRDT'` (incoming)
  - `Amt` → rappen (`Math.round(value * 100)`); guard `currency === 'CHF'`
  - `BookgDt/Dt`, `ValDt/Dt`
  - dive `NtryDtls/TxDtls` for `RmtInf/Strd/CdtrRefInf/Ref`,
    `Refs/EndToEndId`, the debtor name, and `AcctSvcrRef`
  - tolerate both `.001.04` and `.001.08`. Most field paths are stable
    across the two, but **the debtor name is not**: `.04` carries it at
    `RltdPties/Dbtr/Nm` while `.08` wraps the debtor in a party choice at
    `RltdPties/Dbtr/Pty/Nm` — read both. `AcctSvcrRef` can sit at the entry
    (`Ntry/AcctSvcrRef`) or transaction (`TxDtls/Refs/AcctSvcrRef`) level;
    prefer the entry-level one. Also handle fast-xml-parser's
    array-vs-single-object quirk.
  - **reject any other version** with a clear error (matching bexio, which
    refuses anything but v4/v8 — e.g. Wise's `.001.10`)
- Returns a normalized `ParsedStatement`. Pure function → unit-test with
  the existing vitest setup, using sample camt files as fixtures.

## Matching engine — `server/utils/reconcile.ts`

Per parsed credit transaction, in order:

1. **Reference match (deterministic).** `parseReference(reference)` →
   invoice id → load invoice (must not already be `paid`). If amount
   equals the recomputed live total → **auto-confirm** → `matched`, invoice
   marked paid.
2. **Reference match, amount mismatch.** Same invoice, different amount →
   **partial / overpayment**, status `suggested` with a delta flag.
3. **Fuzzy fallback** (no / garbled reference). Open (`sent`) invoices
   where `total_rappen === amount`, optionally debtor name ≈ customer
   name → `suggested`.
4. **Nothing** → `unmatched`.

Marking paid **reuses the existing transition** in
`server/api/invoices/[id].put.ts:33-55` (sets `status='paid'`, `paid_at`,
frozen `total_rappen` together), extended to accept the **booking date**
as `paid_at` instead of today.

## API endpoints (Nitro, matching existing style)

```
POST   /api/bank/import                        multipart camt.053 → parse, dedupe-insert, match, return summary
GET    /api/bank/transactions?status=suggested review queue
POST   /api/bank/transactions/[id]/confirm     { invoice_id } → mark invoice paid (booking date), tx matched
POST   /api/bank/transactions/[id]/ignore      → status ignored (fees, non-invoice income)
GET    /api/bank/imports                        history
DELETE /api/bank/imports/[id]                   cascade; block if it has confirmed matches
```

## UI — `app/pages/banking.vue`

- Drag-drop upload, reusing the attachment-upload pattern from
  `server/api/expenses/[id]/attachments.post.ts`.
- Post-import summary banner: "12 transactions · 9 auto-matched ·
  2 suggestions · 1 unmatched".
- **Suggestions queue** — one card per transaction (amount, date, debtor,
  the invoice it points at) with ✅ confirm / ✏️ pick-another /
  🚫 ignore. This is the "confirm with a click" surface.
- Auto-matched and ignored shown collapsed.
- Add to the sidebar under **Finance**.

## Edge cases

- **Partial payments** — amount < total: v1 keeps the invoice `sent` and
  records the tx as `matched` against it; no balance column yet.
- **Overpayments / collective postings** — one tx, many invoices: out of
  scope for v1; surface as a manual suggestion.
- **Salary / non-invoice income** — credits that aren't invoices →
  `ignored` (could later auto-route to `income_payments`).
- **Re-import overlap** — covered by the `dedupe_hash` unique index.
- **Wrong account** — reject the import if statement IBAN ≠ `sender.iban`.

## Phasing

1. **Phase 1 — done.** `qrReference.ts` refactor + round-trip tests;
   migrations `0035`/`0036`; `camt.ts` parser + fixture tests. (No UI;
   fully testable.)
2. **Phase 2 — done.** `reconcile.ts` matcher (incl. the fuzzy fallback)
   - import/transactions/confirm/ignore/imports endpoints, with the matcher
     and confirm/ignore/delete rules unit-tested. The suggestion _reason_
     (`amount_mismatch` / `unsent` / `fuzzy`) is returned by `decideMatch`
     but not persisted — the schema has no column for it; the UI can derive
     it. Add a column in Phase 3/4 if that proves awkward.
3. **Phase 3 — done.** `app/pages/banking.vue` (drag-drop import, summary
   banner, review queue with confirm / pick-another / ignore, collapsed
   auto-matched + ignored, import history with guarded delete) + sidebar
   entry under Finance + de/en/fr/it strings. The suggestion _reason_ badge
   is derived client-side from the data (no stored column), as planned.
4. **Phase 4** — partial-payment polish (balance tracking, collective
   postings).
5. **Phase 5 — architecture + folder provider done; EBICS provider pending.**
   Automatic nightly ingest so `camt.053` is pulled instead of uploaded by
   hand. The whole pipeline is built and tested; see below.

## Phase 5: automatic bank connection (EBICS / bLink)

A second ingest path alongside manual `camt.053` upload: a connection fetches
statements on a schedule. The established tools offer this as a _direct bank
connection_ (bexio via **bLink**, SIX Group's open-banking platform).

### What's built

- **`bank_connections`** (migration `0037`): one connection per account,
  provider + encrypted `config` (reusing `secrets.ts`), last-sync status.
- **`bankSync.ts`**: a pluggable `BankProvider` interface + `syncConnection`
  /`runBankSync` that fetch statements and hand each to the same
  `reconcileStatement` — so auto-match/suggest/dedupe behave exactly as on a
  manual import. Unit-tested with a fake provider.
- **`folder` provider (functional today)**: scans a watched directory for
  `*.xml` (e.g. your bank drops `camt.053` onto an SFTP share mounted there),
  imports each, and moves it to `processed/`. This is a real, working
  auto-ingest with no bank protocol required.
- **`ebics` provider (slot only)**: configurable, but fetch records a clear
  "not yet implemented" — activation (keys + signed letter) needs a real
  EBICS contract to build and verify, so it's the remaining follow-up.
- **Scheduled job** `server/plugins/04.bank-sync.ts` (mirrors mail-sync), plus
  connection endpoints (`GET/POST/DELETE /api/bank/connection`,
  `POST /api/bank/connection/sync`) and a connection card + manage slideover
  on `banking.vue`.

  The job runs **once per hour during a morning window** — default 06:00–13:00
  **Europe/Zurich** — since banks post statements in the morning and the prod
  container runs UTC (so the hours are interpreted in an explicit zone, not
  server-local). It ticks every 10 min and runs at most once per (date, hour),
  so a missed tick still catches up. Overridable via env:

  | Var | Default | Meaning |
  | --- | --- | --- |
  | `CHOHLE_BANK_SYNC_START_HOUR` | `6` | First hour of the window (0–23) |
  | `CHOHLE_BANK_SYNC_END_HOUR` | `13` | Last hour, inclusive |
  | `CHOHLE_BANK_SYNC_TZ` | `Europe/Zurich` | Zone the hours are read in |

  A user can always force an immediate pull with **Sync now** on the banking
  page (`POST /api/bank/connection/sync`).

> **Ops note:** auto-sync writes to SQLite from a background job. The DB must
> live on a Docker **named volume**, not a macOS bind mount — SQLite on a
> gRPC-FUSE/virtiofs bind mount corrupts (see `docker-compose.yml`,
> `DATABASE_PATH=/app/dbdata/chohle.db`). Uploads stay on the `./data` bind.

### Why this was cheap to add

The reconciliation core is **source-agnostic**. `reconcileStatement(db,
statement, filename)` consumes a parsed `camt.053` and does all the
matching/auto-pay — it does not care how the statement arrived. A bank
connection is therefore a purely _additive ingest path_. No change to the
matcher, the endpoints' confirm/ignore logic, or the UI's review queue.

### Why this is cheap to add later

The reconciliation core is **source-agnostic**. `reconcileStatement(db,
statement, filename)` consumes a parsed `camt.053` and does all the
matching/auto-pay — it does not care how the statement arrived. A bank
connection is therefore a purely _additive ingest path_: fetch a `camt.053`
on a schedule, hand it to the same `reconcileStatement`. No change to the
matcher, the endpoints' confirm/ignore logic, or the UI's review queue.

### The two Swiss mechanisms (and their real cost)

- **EBICS** — a standardized bank protocol. **Code-only** to integrate (a
  mature Node client exists: `node-ebics/node-ebics-client`), works with most
  CH/EU banks, free from the bank. Cost is _onboarding friction_: each
  customer requests EBICS from their bank, generates a key pair, and mails a
  **signed initialization letter** (INI/HIA) — a multi-day, partly offline
  step. We'd also own key storage/security and a nightly job.
- **bLink (SIX)** — the slick "authorize like e-banking, no letters" UX bexio
  uses. Cost is a **commercial partnership** with SIX (onboarding,
  certification, fees, legal) — a business decision, not a sprint, and
  limited to banks on bLink.

Recommendation if/when we build it: **EBICS first** (no partnership needed),
**bLink only if** a SIX partnership is justified. Either way, manual
`camt.053` upload stays as the universal fallback — even bexio keeps it,
because no connection covers every bank.

### Shape of the work (when scheduled)

- A per-account **connection mode** setting: `manual` (today's default) vs
  `connected`. Surfaced in settings, not the banking page.
- A `bank_connections` row holding the provider + (encrypted) credentials /
  EBICS keys, reusing the `secrets.ts` encryption already used for mailbox
  secrets.
- A nightly scheduled task (same mechanism as the reminder/email-sync jobs)
  that fetches the latest `camt.053` per connected account and calls
  `reconcileStatement`. Auto-matched invoices flip to paid exactly as on a
  manual import; suggestions land in the same review queue the owner already
  knows. Re-fetch overlap is already safe via the `dedupe_hash` index.
