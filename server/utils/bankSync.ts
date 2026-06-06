// Automatic bank-statement ingest. A connection fetches camt.053 on a
// schedule (see server/plugins/04.bank-sync.ts) and hands each statement to
// the SAME reconcileStatement the manual upload uses — the matcher, endpoints
// and review queue are unchanged. Providers are pluggable:
//
//   - folder: scan a watched directory for *.xml (e.g. your bank drops camt.053
//     onto an SFTP share mounted there). Fully functional today.
//   - ebics:  the standardized Swiss/EU bank protocol. Wired as a slot; the
//     actual key exchange + download lands in a follow-up (it needs a real
//     EBICS contract to verify). For now it records a clear "not implemented".
//
// Explicit imports (not Nitro auto-imports) so this is unit-testable under
// vitest — see test/bankSync.test.ts.

import { basename, join } from 'node:path'
import { mkdir, readFile, readdir, rename } from 'node:fs/promises'
import type { Database } from 'better-sqlite3'
import { decryptSecret } from './secrets'
import { parseCamt053 } from './camt'
import { reconcileStatement } from './reconcile'

export class BankProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BankProviderError'
  }
}

/** A statement a provider fetched; `ref` is an opaque handle for ack(). */
export interface FetchedStatement {
  ref: string
  filename: string
  xml: string
}

export interface BankProvider {
  /** Fetch statements not yet ingested. `since` is the connection's last sync. */
  fetchStatements(
    config: Record<string, unknown>,
    since: string | null
  ): Promise<FetchedStatement[]>
  /** Mark a fetched statement as handled (e.g. move the file aside). Optional. */
  ack?(config: Record<string, unknown>, ref: string): Promise<void>
}

export interface BankSyncResult {
  fetched: number
  imported: number
  autoMatched: number
  suggested: number
  unmatched: number
  duplicates: number
  errors: string[]
}

export interface BankConnectionRow {
  id: number
  iban: string
  provider: string
  status: string
  config: string | null
  last_sync_at: string | null
  last_status: string | null
  last_error: string | null
  last_summary: string | null
  created_at: string
}

function msg(err: unknown): string {
  return (err as { message?: string })?.message ?? String(err)
}

function parseConfig(stored: string | null): Record<string, unknown> {
  if (!stored) return {}
  return JSON.parse(decryptSecret(stored)) as Record<string, unknown>
}

// --- providers ------------------------------------------------------------

// Scans a directory for camt.053 files and moves each aside once imported, so
// the next run doesn't re-list it. (Re-import would be harmless anyway — the
// dedupe_hash index ignores duplicate transactions — but moving keeps the
// import history clean.)
export const folderProvider: BankProvider = {
  async fetchStatements(config) {
    const dir = String(config.dir ?? '').trim()
    if (!dir) throw new BankProviderError('No folder configured')
    let names: string[]
    try {
      names = await readdir(dir)
    } catch (err) {
      throw new BankProviderError(`Cannot read folder ${dir}: ${msg(err)}`)
    }
    const out: FetchedStatement[] = []
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.xml')).sort()) {
      const ref = join(dir, name)
      out.push({ ref, filename: name, xml: await readFile(ref, 'utf8') })
    }
    return out
  },
  async ack(config, ref) {
    const dir = String(config.dir ?? '').trim()
    const processed = join(dir, 'processed')
    await mkdir(processed, { recursive: true })
    await rename(ref, join(processed, basename(ref)))
  }
}

export const ebicsProvider: BankProvider = {
  async fetchStatements() {
    // Onboarding (config + RSA keys + INI letter) is built; the live key
    // exchange (INI/HIA/HPB) and signed/encrypted C53 download land once the
    // bank has activated the subscriber from the signed letter — that part
    // needs a real EBICS contract to build against. See docs.
    throw new BankProviderError(
      'EBICS statement download is pending activation: generate keys, print the INI letter, sign it and send it to your bank. Live download lands once your EBICS contract is active.'
    )
  }
}

const PROVIDERS: Record<string, BankProvider> = {
  folder: folderProvider,
  ebics: ebicsProvider
}

export function providerFor(name: string): BankProvider | null {
  return PROVIDERS[name] ?? null
}

// --- orchestration --------------------------------------------------------

/**
 * Sync one connection: fetch its statements, reconcile each (independently —
 * one bad file doesn't sink the rest), ack the good ones, and stamp the
 * outcome on the connection row. Never throws; failures are recorded.
 */
export async function syncConnection(
  db: Database,
  conn: BankConnectionRow,
  provider: BankProvider
): Promise<BankSyncResult> {
  const result: BankSyncResult = {
    fetched: 0,
    imported: 0,
    autoMatched: 0,
    suggested: 0,
    unmatched: 0,
    duplicates: 0,
    errors: []
  }

  try {
    const config = parseConfig(conn.config)
    const statements = await provider.fetchStatements(config, conn.last_sync_at)
    result.fetched = statements.length
    for (const st of statements) {
      try {
        const summary = reconcileStatement(db, parseCamt053(st.xml), st.filename)
        result.imported++
        result.autoMatched += summary.autoMatched
        result.suggested += summary.suggested
        result.unmatched += summary.unmatched
        result.duplicates += summary.duplicates
        if (provider.ack) await provider.ack(config, st.ref)
      } catch (err) {
        result.errors.push(`${st.filename}: ${msg(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(msg(err))
  }

  const ok = result.errors.length === 0
  db.prepare(
    `UPDATE bank_connections
     SET last_sync_at = datetime('now'), last_status = ?, last_error = ?, last_summary = ?
     WHERE id = ?`
  ).run(ok ? 'ok' : 'error', ok ? null : result.errors.join('; '), JSON.stringify(result), conn.id)

  return result
}

/** Sync every active connection. Used by the nightly job. */
export async function runBankSync(db: Database): Promise<void> {
  const conns = db
    .prepare("SELECT * FROM bank_connections WHERE status = 'active'")
    .all() as BankConnectionRow[]
  for (const conn of conns) {
    const provider = providerFor(conn.provider)
    if (!provider) continue
    const result = await syncConnection(db, conn, provider)
    if (result.imported > 0 || result.errors.length > 0) {
      console.log(
        `[bank-sync] connection ${conn.id} (${conn.provider}): ` +
          `${result.imported} imported, ${result.autoMatched} auto-matched, ${result.errors.length} error(s)`
      )
    }
  }
}

// --- helpers for the endpoints --------------------------------------------

const SECRET_CONFIG_KEYS = ['userKeys', 'bankKeys', 'keys', 'password', 'passphrase']

export function getConnection(db: Database): BankConnectionRow | null {
  return (
    (db.prepare('SELECT * FROM bank_connections LIMIT 1').get() as BankConnectionRow | undefined) ??
    null
  )
}

/** Whether the connection already has generated EBICS keys (for the UI to show
 * the INI-letter action) — without exposing the keys themselves. */
export function configHasKeys(stored: string | null): boolean {
  try {
    const cfg = parseConfig(stored) as { keys?: { signature?: { privateKey?: string } } }
    return Boolean(cfg.keys?.signature?.privateKey)
  } catch {
    return false
  }
}

/** Decrypt a connection's config for display, with secret fields stripped. */
export function sanitizeConfig(stored: string | null): Record<string, unknown> {
  let cfg: Record<string, unknown>
  try {
    cfg = parseConfig(stored)
  } catch {
    return {}
  }
  const clean = { ...cfg }
  for (const k of SECRET_CONFIG_KEYS) delete clean[k]
  return clean
}
