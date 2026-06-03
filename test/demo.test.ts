// The core promise of demo mode: each session gets its own isolated database
// (seeded in its locale), one session's writes never leak into another's, and
// Reset returns a session to a pristine template. This exercises the session
// machinery directly — no Nitro/container needed.

process.env.CHOHLE_SECRET = 'test-secret-key-0123456789'

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { resetSessionDb, resolveSessionDb } from '../server/utils/demo'

const SID_A = 'a'.repeat(32)
const SID_B = 'b'.repeat(32)

beforeAll(() => {
  // Point templates + sessions at a throwaway dir (read at call time).
  process.env.DEMO_DATA_PATH = mkdtempSync(join(tmpdir(), 'chohle-demo-'))
})

function customerCount(db: import('better-sqlite3').Database): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM customers').get() as { c: number }).c
}

describe('demo session isolation', () => {
  it('seeds a non-empty sandbox per session', () => {
    const a = resolveSessionDb(SID_A, 'en')
    expect(customerCount(a)).toBeGreaterThan(0)
    expect(
      (a.prepare('SELECT locale FROM owner WHERE id = 1').get() as { locale: string }).locale
    ).toBe('en')
  })

  it("keeps one session's writes invisible to another", () => {
    const a = resolveSessionDb(SID_A, 'en')
    const b = resolveSessionDb(SID_B, 'en')

    a.prepare(
      "INSERT INTO customers (type, name, country, language) VALUES ('company', 'SoloOnlyInA', 'CH', 'en')"
    ).run()

    const inA = a
      .prepare("SELECT COUNT(*) AS c FROM customers WHERE name = 'SoloOnlyInA'")
      .get() as { c: number }
    const inB = b
      .prepare("SELECT COUNT(*) AS c FROM customers WHERE name = 'SoloOnlyInA'")
      .get() as { c: number }
    expect(inA.c).toBe(1)
    expect(inB.c).toBe(0)
  })

  it('seeds demo data in the requested locale', () => {
    const de = resolveSessionDb('d'.repeat(32), 'de')
    expect(
      (de.prepare('SELECT locale FROM owner WHERE id = 1').get() as { locale: string }).locale
    ).toBe('de')
    // customer document language follows the seed locale
    const langs = de.prepare('SELECT DISTINCT language FROM customers').all() as {
      language: string
    }[]
    expect(langs.some((l) => l.language === 'de')).toBe(true)
  })

  it('falls back to English for an unknown locale', () => {
    const x = resolveSessionDb('e'.repeat(32), 'zz')
    expect(
      (x.prepare('SELECT locale FROM owner WHERE id = 1').get() as { locale: string }).locale
    ).toBe('en')
  })

  it('Reset wipes a session back to the pristine template', () => {
    const a = resolveSessionDb(SID_A, 'en')
    expect(
      (
        a.prepare("SELECT COUNT(*) AS c FROM customers WHERE name = 'SoloOnlyInA'").get() as {
          c: number
        }
      ).c
    ).toBe(1)

    resetSessionDb(SID_A, 'en')

    const fresh = resolveSessionDb(SID_A, 'en')
    expect(
      (
        fresh.prepare("SELECT COUNT(*) AS c FROM customers WHERE name = 'SoloOnlyInA'").get() as {
          c: number
        }
      ).c
    ).toBe(0)
    expect(customerCount(fresh)).toBeGreaterThan(0) // back to seeded baseline
  })
})
