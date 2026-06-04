import { XMLParser } from 'fast-xml-parser'

// Parses a Swiss camt.053 bank statement into the normalized shape the
// reconciliation engine consumes. Pure function (string in, data out) so it can
// be unit-tested against fixture files without a database — see test/camt.test.ts.
//
// Scope: only SPS-2021 (camt.053.001.04) and SPS-2022 (camt.053.001.08) are
// accepted, matching bexio, which refuses any other version (e.g. Wise's
// .001.10). We keep only incoming credits (CdtDbtInd === 'CRDT'); debits are a
// bank's outgoing payments and never settle one of our invoices.

export interface ParsedCredit {
  /** Booking date, YYYY-MM-DD (Ntry/BookgDt). Used as the invoice paid_at. */
  bookingDate: string
  /** Value date, YYYY-MM-DD (Ntry/ValDt), or null if absent. */
  valueDate: string | null
  /** Entry amount in rappen (minor units). Always positive for a credit. */
  amountRappen: number
  currency: string
  /** Structured creditor reference (QRR/SCOR) — the deterministic match key. */
  reference: string | null
  endToEndId: string | null
  debtorName: string | null
  /** Bank's own unique reference for the entry; part of the dedupe hash. */
  acctSvcrRef: string | null
}

export interface ParsedStatement {
  /** Statement account IBAN (Acct/Id/IBAN); validated against sender.iban. */
  iban: string
  /** camt minor version, 4 or 8. */
  version: number
  statementId: string | null
  fromDate: string | null
  toDate: string | null
  credits: ParsedCredit[]
}

const SUPPORTED_VERSIONS = new Set([4, 8])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Numeric-looking strings (references, IBANs) must stay strings — never let
  // the parser coerce a 27-digit QR reference into a lossy float.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
})

/** Wrap fast-xml-parser's single-object-vs-array result into an array. */
function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** Trim to a non-empty string, or null. */
function str(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length ? t : null
}

/** Read a camt date node ({ Dt } or { DtTm }) as a YYYY-MM-DD string. */
function readDate(node: any): string | null {
  const raw = str(node?.Dt) ?? str(node?.DtTm)
  return raw ? raw.slice(0, 10) : null
}

export class CamtParseError extends Error {}

export function parseCamt053(xml: string): ParsedStatement {
  const version = detectVersion(xml)

  const doc = parser.parse(xml)
  const root = doc?.Document?.BkToCstmrStmt
  if (!root) {
    throw new CamtParseError('Not a camt.053 document: missing Document/BkToCstmrStmt')
  }

  const statements = toArray(root.Stmt)
  if (statements.length === 0) {
    throw new CamtParseError('camt.053 contains no statement (Stmt)')
  }

  // A file may carry several statements for the same account across periods.
  // Reject a file that mixes accounts — an import targets exactly one IBAN.
  const ibans = statements.map((s: any) => str(s?.Acct?.Id?.IBAN))
  const iban = ibans[0]
  if (!iban) {
    throw new CamtParseError('camt.053 statement is missing the account IBAN')
  }
  if (ibans.some((i: string | null) => i !== iban)) {
    throw new CamtParseError('camt.053 file mixes multiple accounts')
  }

  const credits: ParsedCredit[] = []
  const froms: string[] = []
  const tos: string[] = []
  for (const stmt of statements) {
    const from = readDate(stmt?.FrToDt && { Dt: stmt.FrToDt.FrDtTm })
    const to = readDate(stmt?.FrToDt && { Dt: stmt.FrToDt.ToDtTm })
    if (from) froms.push(from)
    if (to) tos.push(to)
    for (const ntry of toArray(stmt?.Ntry)) {
      const credit = readEntry(ntry)
      if (credit) credits.push(credit)
    }
  }

  return {
    iban,
    version,
    statementId: str(statements[0]?.Id),
    fromDate: froms.length ? froms.sort()[0]! : null,
    toDate: tos.length ? tos.sort().at(-1)! : null,
    credits
  }
}

function detectVersion(xml: string): number {
  const m = xml.match(/camt\.053\.001\.(\d{2})/)
  if (!m) {
    throw new CamtParseError('Not a camt.053 document (no camt.053.001.NN namespace found)')
  }
  const version = Number(m[1])
  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new CamtParseError(
      `Unsupported camt.053 version .001.${m[1]}; only .001.04 and .001.08 are accepted`
    )
  }
  return version
}

/** Map one Ntry to a credit, or null if it is not an incoming credit. */
function readEntry(ntry: any): ParsedCredit | null {
  if (str(ntry?.CdtDbtInd) !== 'CRDT') return null

  const amount = readAmount(ntry?.Amt)
  if (amount === null) return null

  const bookingDate = readDate(ntry?.BookgDt)
  if (!bookingDate) return null

  // A normal payment carries a single TxDtls. Collective/batch entries bundle
  // several — v1 reads the first for reference/debtor; the entry amount won't
  // match any single invoice, so it falls through to the manual queue.
  const txDtls = toArray(ntry?.NtryDtls?.TxDtls)[0]

  return {
    bookingDate,
    valueDate: readDate(ntry?.ValDt),
    amountRappen: amount.rappen,
    currency: amount.currency,
    reference: readReference(txDtls),
    endToEndId: normalizeEndToEnd(str(txDtls?.Refs?.EndToEndId)),
    debtorName: readDebtorName(txDtls),
    acctSvcrRef: str(ntry?.AcctSvcrRef) ?? str(txDtls?.Refs?.AcctSvcrRef)
  }
}

function readAmount(amt: any): { rappen: number; currency: string } | null {
  const value = str(amt?.['#text'])
  if (value === null) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return { rappen: Math.round(num * 100), currency: str(amt?.['@_Ccy']) ?? 'CHF' }
}

function readReference(txDtls: any): string | null {
  for (const strd of toArray(txDtls?.RmtInf?.Strd)) {
    const ref = str(strd?.CdtrRefInf?.Ref)
    if (ref) return ref
  }
  return null
}

function readDebtorName(txDtls: any): string | null {
  const dbtr = txDtls?.RltdPties?.Dbtr
  // .04: Dbtr/Nm directly. .08: Dbtr wraps a Pty choice -> Dbtr/Pty/Nm.
  return str(dbtr?.Nm) ?? str(dbtr?.Pty?.Nm)
}

function normalizeEndToEnd(value: string | null): string | null {
  // The ISO sentinel for "no reference supplied" is not a real id.
  return value && value.toUpperCase() !== 'NOTPROVIDED' ? value : null
}
