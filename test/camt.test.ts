import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CamtParseError, parseCamt053 } from '../server/utils/camt'

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseCamt053 — SPS-2022 (camt.053.001.08)', () => {
  const stmt = parseCamt053(fixture('camt053-v08.xml'))

  it('reads statement-level metadata', () => {
    expect(stmt.version).toBe(8)
    expect(stmt.iban).toBe('CH4431999123000889012')
    expect(stmt.statementId).toBe('STMT-2026-001')
    expect(stmt.fromDate).toBe('2026-01-01')
    expect(stmt.toDate).toBe('2026-01-31')
  })

  it('keeps only incoming credits (the debit is skipped)', () => {
    expect(stmt.credits).toHaveLength(2)
  })

  it('extracts the QR-referenced credit and prefers the entry-level AcctSvcrRef', () => {
    const c = stmt.credits[0]!
    expect(c.amountRappen).toBe(579685)
    expect(c.currency).toBe('CHF')
    expect(c.bookingDate).toBe('2026-01-15')
    expect(c.valueDate).toBe('2026-01-16')
    expect(c.reference).toBe('210000000003139471430009017')
    expect(c.endToEndId).toBe('E2E-0001')
    expect(c.debtorName).toBe('Müller AG') // .08 path: Dbtr/Pty/Nm
    expect(c.acctSvcrRef).toBe('ACCT-REF-0001') // entry-level wins over TX-REF-0001
  })

  it('normalizes a reference-less credit (NOTPROVIDED -> null)', () => {
    const c = stmt.credits[1]!
    expect(c.amountRappen).toBe(25000)
    expect(c.reference).toBeNull()
    expect(c.endToEndId).toBeNull()
    expect(c.valueDate).toBeNull()
    expect(c.debtorName).toBe('Jürg Beispiel')
  })
})

describe('parseCamt053 — SPS-2021 (camt.053.001.04)', () => {
  const stmt = parseCamt053(fixture('camt053-v04.xml'))

  it('reads the version and the .04 debtor path (Dbtr/Nm)', () => {
    expect(stmt.version).toBe(4)
    expect(stmt.credits).toHaveLength(1)
    const c = stmt.credits[0]!
    expect(c.amountRappen).toBe(120000)
    expect(c.reference).toBe('210000000003139471430009017')
    expect(c.debtorName).toBe('Alte Firma GmbH')
  })
})

describe('parseCamt053 — rejections', () => {
  it('rejects an unsupported version (.001.10, e.g. Wise)', () => {
    const xml = fixture('camt053-v08.xml').replace('camt.053.001.08', 'camt.053.001.10')
    expect(() => parseCamt053(xml)).toThrow(CamtParseError)
    expect(() => parseCamt053(xml)).toThrow(/\.001\.10/)
  })

  it('rejects a document that is not camt.053 at all', () => {
    expect(() => parseCamt053('<Document xmlns="urn:other"><x/></Document>')).toThrow(
      CamtParseError
    )
  })

  it('rejects a file that mixes two accounts', () => {
    const mixed = fixture('camt053-v08.xml').replace(
      '</Stmt>\n  </BkToCstmrStmt>',
      `</Stmt>
    <Stmt>
      <Id>STMT-OTHER</Id>
      <Acct><Id><IBAN>CH9300762011623852957</IBAN></Id></Acct>
    </Stmt>
  </BkToCstmrStmt>`
    )
    expect(() => parseCamt053(mixed)).toThrow(/mixes multiple accounts/)
  })
})
