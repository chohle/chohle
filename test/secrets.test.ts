import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret, secretIsAvailable } from '../server/utils/secrets'

describe('secrets', () => {
  const originalSecret = process.env.BATZE_SECRET

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BATZE_SECRET
    else process.env.BATZE_SECRET = originalSecret
  })

  it('round-trips a plaintext through encrypt + decrypt', () => {
    const plain = 'eyJ0b2tlbiI6IkV3QmdBOFhxV3YifQ==.refresh-token'
    const stored = encryptSecret(plain)
    expect(stored).not.toContain(plain)
    expect(stored.split(':')).toHaveLength(3) // iv:authTag:ciphertext
    expect(decryptSecret(stored)).toBe(plain)
  })

  it('produces a different ciphertext each call (fresh IV)', () => {
    const a = encryptSecret('same-input')
    const b = encryptSecret('same-input')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-input')
    expect(decryptSecret(b)).toBe('same-input')
  })

  it('throws when the ciphertext has been tampered with', () => {
    const stored = encryptSecret('original')
    // Flip a hex digit in the ciphertext segment to corrupt it.
    const [iv, tag, data] = stored.split(':')
    const flipped = data!.startsWith('a') ? 'b' + data!.slice(1) : 'a' + data!.slice(1)
    expect(() => decryptSecret(`${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('throws when the auth tag has been tampered with', () => {
    const stored = encryptSecret('original')
    const [iv, tag, data] = stored.split(':')
    const flipped = tag!.startsWith('a') ? 'b' + tag!.slice(1) : 'a' + tag!.slice(1)
    expect(() => decryptSecret(`${iv}:${flipped}:${data}`)).toThrow()
  })

  it('rejects malformed stored values', () => {
    expect(() => decryptSecret('not-three-parts')).toThrow(/malformed/)
  })

  it('refuses to encrypt without BATZE_SECRET (or too short)', async () => {
    // The module caches the derived key on first call, so we have to drop
    // it from the module cache and import a fresh copy with no env set.
    delete process.env.BATZE_SECRET
    vi.resetModules()
    const mod = await import('../server/utils/secrets')
    expect(mod.secretIsAvailable()).toBe(false)
    expect(() => mod.encryptSecret('x')).toThrow(/BATZE_SECRET/)
  })

  it('secretIsAvailable returns true when key is set', () => {
    expect(secretIsAvailable()).toBe(true)
  })
})
