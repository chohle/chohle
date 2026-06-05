import { describe, it, expect } from 'vitest'
import { createPublicKey } from 'node:crypto'
import {
  generateEbicsKeys,
  ebicsPublicKeyHash,
  formatHashForLetter,
  buildIniLetter
} from '../server/utils/ebics'

describe('ebics keys', () => {
  it('generates three distinct RSA-2048 key pairs', () => {
    const k = generateEbicsKeys('2026-01-01T00:00:00.000Z')
    for (const pair of [k.signature, k.encryption, k.authentication]) {
      expect(pair.publicKey).toContain('BEGIN PUBLIC KEY')
      expect(pair.privateKey).toContain('BEGIN PRIVATE KEY')
      const jwk = createPublicKey(pair.publicKey).export({ format: 'jwk' }) as { n: string }
      // 2048-bit modulus → 256 bytes → 342 base64url chars (±padding)
      expect(Buffer.from(jwk.n, 'base64url').length).toBe(256)
    }
    // the three keys must differ
    expect(k.signature.privateKey).not.toBe(k.encryption.privateKey)
    expect(k.encryption.privateKey).not.toBe(k.authentication.privateKey)
    expect(k.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('public-key hash is a stable, uppercase SHA-256 hex for a given key', () => {
    const k = generateEbicsKeys()
    const h1 = ebicsPublicKeyHash(k.signature.publicKey)
    const h2 = ebicsPublicKeyHash(k.signature.publicKey)
    expect(h1).toBe(h2) // deterministic
    expect(h1).toMatch(/^[0-9A-F]{64}$/) // 32-byte SHA-256, uppercase hex
    // different keys → different hashes
    expect(ebicsPublicKeyHash(k.encryption.publicKey)).not.toBe(h1)
  })

  it('rejects a non-RSA / invalid public key', () => {
    expect(() => ebicsPublicKeyHash('not a key')).toThrow()
  })

  it('formats a hash into space-separated byte pairs', () => {
    expect(formatHashForLetter('AABBCC')).toBe('AA BB CC')
  })

  it('builds an INI letter with all three keys and the right EBICS names', () => {
    const k = generateEbicsKeys()
    const letter = buildIniLetter(
      { version: 'H005', hostId: 'EBXUBSCH', partnerId: 'P123', userId: 'U456' },
      k,
      '2026-06-05'
    )
    expect(letter).toMatchObject({
      version: 'H005',
      hostId: 'EBXUBSCH',
      partnerId: 'P123',
      userId: 'U456',
      date: '2026-06-05'
    })
    expect(letter.keys.map((l) => l.ebicsName)).toEqual(['A006', 'E002', 'X002'])
    for (const l of letter.keys) expect(l.hash).toMatch(/^([0-9A-F]{2} ){31}[0-9A-F]{2}$/)
  })
})
