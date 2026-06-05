# Bankabgleich (camt.053 bank reconciliation)

chohle's pitch is "I sent the invoice → I got paid," but marking an invoice
paid used to be a manual click. This feature closes that loop: read a
`camt.053` bank statement, match each incoming payment to an open invoice by
its Swiss QR reference, and mark matched invoices paid — automatically.

Statements arrive two ways:

- **Manual upload** — drop a `camt.053` file exported from e-banking onto the
  banking page.
- **Connected bank** — a connection pulls statements on a schedule and feeds
  them through the exact same pipeline (see [Automatic sync](#automatic-sync)).

## Deterministic matching

The QR reference chohle prints on every QR-bill is derived deterministically
from `sender.iban + invoice.id` (`server/utils/qrReference.ts`, used by both
`invoicePdf.ts` and `qrbill.get.ts` so they can never drift):

- **QR-IBAN → QRR**: `String(id).padStart(26, '0') + checksum` (27 digits)
- **regular IBAN → SCOR**: `RF + checksum + id`

So matching is just **reverse the encoding → recover the exact invoice id**.
Any payment made by scanning chohle's own QR-bill matches with certainty.
Amount/debtor fuzzy matching is only the fallback for payments made without
the reference.

```ts
buildReference(invoiceId: number, iban: string): string
parseReference(ref: string): number | null // → invoice id, or null
```

The round-trip (`parseReference(buildReference(id)) === id`) is unit-tested for
both QRR and SCOR in `test/qrReference.test.ts`.

## Auto-mark on exact match

When the reference resolves to an invoice **and** the amount equals the
invoice's live total, the invoice flips to `paid` on import (booking date as
`paid_at`). This is safe precisely because the reference is deterministic —
there's no ambiguity to confirm away. Everything less certain (amount
mismatch, no/garbled reference, not-yet-sent invoice) goes to a **review
queue** for a one-click confirm instead.

Partial payments and one-payment-many-invoices (collective postings) are
surfaced as suggestions to resolve by hand; there's no balance-tracking column
yet.

## Data model

Three migrations (`server/utils/migrate.ts`), all new tables:

```
0038_bank_imports        one row per imported statement (filename, iban,
                         statement id, period, tx count)
0039_bank_transactions   the incoming CRDT credits parsed from a statement;
                         status unmatched|suggested|matched|ignored, invoice_id
                         set once matched. UNIQUE dedupe_hash.
0040_bank_connections    one connection per account: provider (folder|ebics),
                         status, encrypted config, last-sync result. UNIQUE iban.
```

The unique `dedupe_hash` on `bank_transactions` makes re-importing an
overlapping statement safe (camt.053 files overlap at period boundaries):
rows are inserted with `INSERT OR IGNORE`. The migrations use
`CREATE TABLE/INDEX IF NOT EXISTS` so they're safe on a database that already
ran an earlier numbering of these tables.

## camt.053 parser — `server/utils/camt.ts`

Uses `fast-xml-parser` (no native deps). Parses
`Document/BkToCstmrStmt/Stmt`: account IBAN, statement id, period; then each
`Ntry`:

- keep only `CdtDbtInd === 'CRDT'` (incoming); require `currency === 'CHF'`
- amount → rappen (`Math.round(value * 100)`); booking + value dates
- from `NtryDtls/TxDtls`: the structured reference
  (`RmtInf/Strd/CdtrRefInf/Ref`), `EndToEndId`, debtor name, `AcctSvcrRef`

Accepts **SPS-2022 (`camt.053.001.08`)** and **SPS-2021 (`camt.053.001.04`)**
and rejects any other version with a clear error. The two differ in a few
paths — notably the debtor name (`.04`: `RltdPties/Dbtr/Nm`; `.08`:
`RltdPties/Dbtr/Pty/Nm`) — which the parser reads from both. Pure function,
unit-tested against fixtures in `test/camt.test.ts`.

## Matching engine — `server/utils/reconcile.ts`

Per parsed credit, in order:

1. **Reference match.** `parseReference` → invoice id → load invoice (not
   already paid). Amount equals the live total → **auto-confirm**: `matched`,
   invoice marked paid (booking date as `paid_at`).
2. **Reference match, amount differs** → `suggested` with a delta flag.
3. **Fuzzy fallback** (no/garbled reference): open (`sent`) invoices where the
   total equals the amount, debtor ≈ customer → `suggested`.
4. **Nothing** → `unmatched`.

Marking paid reuses the existing invoice transition (status `paid`, `paid_at`,
frozen `total_rappen`), with the booking date as `paid_at`.

## API & UI

```
POST   /api/bank/import                        multipart camt.053 → parse, dedupe, match, summary
GET    /api/bank/transactions?status=suggested review queue
POST   /api/bank/transactions/[id]/confirm     { invoice_id } → mark paid, tx matched
POST   /api/bank/transactions/[id]/ignore      → ignored (fees, non-invoice income)
GET    /api/bank/imports / DELETE [id]          history; delete blocked if it has confirmed matches
GET/POST/DELETE /api/bank/connection            the bank connection (single, single-tenant)
POST   /api/bank/connection/sync                force an immediate pull
GET    /api/bank/connection/ini-letter          printable EBICS initialization letter
```

`app/pages/banking.vue`: drag-drop upload, a post-import summary banner, the
review queue (confirm / pick-another / ignore), collapsed auto-matched +
ignored, and import history with guarded delete. Sidebar entry under
**Finance**. Strings in de/en/fr/it.

The reconciliation core is **source-agnostic**: `reconcileStatement(db,
statement, filename)` consumes a parsed statement and does all the
matching/auto-pay regardless of how it arrived. Every ingest path is therefore
purely additive — no change to the matcher, endpoints, or review queue.

## Automatic sync

`server/utils/bankSync.ts` defines a pluggable `BankProvider`;
`server/plugins/04.bank-sync.ts` walks active connections and hands whatever
they fetch to the same `reconcileStatement`.

The job runs **once per hour during a morning window** — default 06:00–13:00
**Europe/Zurich** — since banks post statements in the morning and the prod
container runs UTC (so hours are read in an explicit zone, not server-local).
It ticks every 10 min and runs at most once per (date, hour), so a missed tick
still catches up. **Sync now** on the banking page forces an immediate pull.

| Var                           | Default         | Meaning                         |
| ----------------------------- | --------------- | ------------------------------- |
| `CHOHLE_BANK_SYNC_START_HOUR` | `6`             | First hour of the window (0–23) |
| `CHOHLE_BANK_SYNC_END_HOUR`   | `13`            | Last hour, inclusive            |
| `CHOHLE_BANK_SYNC_TZ`         | `Europe/Zurich` | Zone the hours are read in      |

### Providers

- **`folder` (works today).** Scans a watched directory for `*.xml` — e.g.
  your bank drops `camt.053` onto an SFTP share mounted there — imports each,
  and moves it to `processed/`. A real auto-ingest with no bank protocol.
- **`ebics` (onboarding built; download pending a contract).** See below.

> **Ops note:** auto-sync writes to SQLite from a background job. The DB must
> live on a Docker **named volume**, not a macOS bind mount — SQLite on a
> gRPC-FUSE/virtiofs bind mount corrupts (see `docker-compose.yml`,
> `DATABASE_PATH=/app/dbdata/chohle.db`). Uploads stay on the `./data` bind.

## EBICS

EBICS is a standardized bank protocol for fetching statements without manual
file export. Setting it up has two halves; chohle builds the half that can be
done (and verified) without a live bank contract, and structures the rest.

### Built — subscriber onboarding (`server/utils/ebics.ts`)

When you create an EBICS connection (version `H004`/`H005`, host URL, host ID,
partner ID, user ID), chohle:

1. **Generates the three RSA-2048 key pairs** EBICS requires — A006
   (bank-technical signature), E002 (encryption), X002 (authentication).
2. **Stores them encrypted** inside the connection's `config` (same
   `secrets.ts` key as mailbox credentials). Private keys are never returned to
   the client — `sanitizeConfig` strips them and `GET /api/bank/connection`
   exposes only a `keysReady` flag.
3. **Renders the INI letter** (`GET /api/bank/connection/ini-letter`): a
   printable page with the SHA-256 hashes of the three public keys. The user
   prints it, signs it, and mails/uploads it to the bank to activate the
   subscriber.

Key generation, the public-key hash, and the letter are unit-tested in
`test/ebics.test.ts`.

### Pending — the live handshake (needs a contract)

The activation exchange (INI/HIA to send the bank the public keys, HPB to
download the bank's keys) and the signed + AES-encrypted C53/Z53 statement
download require a real EBICS contract to build against and verify. Until a
connection is activated, the `ebics` provider's sync records a clear "pending
activation" message rather than silently doing nothing. The connection stays
`pending` until that flow is implemented and the bank has activated the
subscriber.

Manual `camt.053` upload remains the universal fallback — no connection
mechanism covers every bank.
