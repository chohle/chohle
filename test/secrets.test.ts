import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decryptSecret,
  decryptSecretDetailed,
  encryptSecret,
  hasPreviousSecret,
  secretIsAvailable
} from '../server/utils/secrets'

// Produced by the pre-v1 code (no version prefix) under the test key from
// test/setup.ts, plaintext "legacy-refresh-token". Guards against ever
// breaking rows written before key rotation existed.
const LEGACY_STORED =
  'bc8c4096414c2b43923183d0:e048196cebbfa770f2c2298be11d6dfc:21eb8e7cb6f3f2fef29902859f4442225f57cb4a'

const OLD_SECRET = 'old-secret-before-rotation-1234'
const NEW_SECRET = 'new-secret-after-rotation-5678'

describe('secrets', () => {
  const originalSecret = process.env.CHOHLE_SECRET

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CHOHLE_SECRET
    else process.env.CHOHLE_SECRET = originalSecret
    delete process.env.CHOHLE_SECRET_PREVIOUS
  })

  it('round-trips a plaintext through encrypt + decrypt', () => {
    const plain = 'eyJ0b2tlbiI6IkV3QmdBOFhxV3YifQ==.refresh-token'
    const stored = encryptSecret(plain)
    expect(stored).not.toContain(plain)
    expect(stored.split(':')).toHaveLength(4) // v1:iv:authTag:ciphertext
    expect(stored.startsWith('v1:')).toBe(true)
    expect(decryptSecret(stored)).toBe(plain)
    expect(decryptSecretDetailed(stored).stale).toBe(false)
  })

  it('produces a different ciphertext each call (fresh IV)', () => {
    const a = encryptSecret('same-input')
    const b = encryptSecret('same-input')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-input')
    expect(decryptSecret(b)).toBe('same-input')
  })

  it('still reads rows written in the legacy format without a version prefix', () => {
    const { plain, stale } = decryptSecretDetailed(LEGACY_STORED)
    expect(plain).toBe('legacy-refresh-token')
    expect(stale).toBe(true)
    // And anything the current code writes, minus the prefix, is the same bytes.
    const legacyShaped = encryptSecret('hello').replace(/^v1:/, '')
    expect(decryptSecret(legacyShaped)).toBe('hello')
  })

  it('throws when the ciphertext has been tampered with', () => {
    const stored = encryptSecret('original')
    // Flip a hex digit in the ciphertext segment to corrupt it.
    const [v, iv, tag, data] = stored.split(':')
    const flipped = data!.startsWith('a') ? 'b' + data!.slice(1) : 'a' + data!.slice(1)
    expect(() => decryptSecret(`${v}:${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('throws when the auth tag has been tampered with', () => {
    const stored = encryptSecret('original')
    const [v, iv, tag, data] = stored.split(':')
    const flipped = tag!.startsWith('a') ? 'b' + tag!.slice(1) : 'a' + tag!.slice(1)
    expect(() => decryptSecret(`${v}:${iv}:${flipped}:${data}`)).toThrow()
  })

  it('rejects malformed or unsupported stored values', () => {
    expect(() => decryptSecret('not-three-parts')).toThrow(/malformed/)
    expect(() => decryptSecret('v1:::')).toThrow(/malformed/)
    expect(() => decryptSecret('a:b:c:d:e')).toThrow(/malformed/)
    expect(() => decryptSecret('v2:aa:bb:cc')).toThrow(/unsupported version/)
  })

  it('refuses to encrypt without CHOHLE_SECRET (or too short)', async () => {
    delete process.env.CHOHLE_SECRET
    vi.resetModules()
    const mod = await import('../server/utils/secrets')
    expect(mod.secretIsAvailable()).toBe(false)
    expect(() => mod.encryptSecret('x')).toThrow(/CHOHLE_SECRET/)
    process.env.CHOHLE_SECRET = 'short'
    expect(mod.secretIsAvailable()).toBe(false)
  })

  it('secretIsAvailable returns true when key is set', () => {
    expect(secretIsAvailable()).toBe(true)
    expect(hasPreviousSecret()).toBe(false)
  })

  describe('key rotation', () => {
    it('decrypts with CHOHLE_SECRET_PREVIOUS after the key changed and flags the row stale', () => {
      process.env.CHOHLE_SECRET = OLD_SECRET
      const stored = encryptSecret('token-from-before')

      process.env.CHOHLE_SECRET = NEW_SECRET
      // Without the previous key the old row is unreadable.
      expect(() => decryptSecret(stored)).toThrow()

      process.env.CHOHLE_SECRET_PREVIOUS = OLD_SECRET
      expect(hasPreviousSecret()).toBe(true)
      const { plain, stale } = decryptSecretDetailed(stored)
      expect(plain).toBe('token-from-before')
      expect(stale).toBe(true)

      // New writes use the new key and are not stale.
      const rewritten = encryptSecret(plain)
      expect(decryptSecretDetailed(rewritten).stale).toBe(false)
      delete process.env.CHOHLE_SECRET_PREVIOUS
      expect(decryptSecret(rewritten)).toBe('token-from-before')
    })

    it('accepts several comma separated previous keys', () => {
      process.env.CHOHLE_SECRET = 'first-secret-of-them-all-0000'
      const oldest = encryptSecret('oldest')
      process.env.CHOHLE_SECRET = OLD_SECRET
      const older = encryptSecret('older')
      process.env.CHOHLE_SECRET = NEW_SECRET
      process.env.CHOHLE_SECRET_PREVIOUS = ` ${OLD_SECRET}, first-secret-of-them-all-0000 `
      expect(decryptSecret(oldest)).toBe('oldest')
      expect(decryptSecret(older)).toBe('older')
    })

    it('still rejects tampered data when previous keys are configured', () => {
      process.env.CHOHLE_SECRET = NEW_SECRET
      process.env.CHOHLE_SECRET_PREVIOUS = OLD_SECRET
      const stored = encryptSecret('original')
      expect(() => decryptSecret(stored.slice(0, -2) + '00')).toThrow(/could not be decrypted/)
    })

    it('rejects a too short previous key', () => {
      process.env.CHOHLE_SECRET_PREVIOUS = 'short'
      expect(() => encryptSecret('x')).toThrow(/CHOHLE_SECRET_PREVIOUS/)
      expect(secretIsAvailable()).toBe(false)
    })
  })
})
