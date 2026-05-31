// AES-256-GCM symmetric encryption for at-rest secrets (OAuth tokens,
// IMAP passwords). The key is derived from `process.env.BATZE_SECRET`
// via SHA-256 so any non-empty string yields a valid 32-byte key.
//
// Stored format: `<iv hex>:<authTag hex>:<ciphertext hex>` so the row
// is one self-contained TEXT column with no separate IV storage. The
// 12-byte IV is generated fresh per encryption (NIST recommends 96 bits
// for GCM); never reused for the same key.
//
// Rotating BATZE_SECRET invalidates every stored token; affected
// mailboxes need to be reconnected. Acceptable for a single user
// self-hosted tool.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.BATZE_SECRET
  if (!raw || raw.length < 16) {
    throw new Error('BATZE_SECRET is required (16+ chars) to encrypt mailbox credentials')
  }
  cachedKey = createHash('sha256').update(raw, 'utf8').digest()
  return cachedKey
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(':')
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('encrypted secret is malformed')
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
}

// `secretIsAvailable` lets the UI surface a helpful "set BATZE_SECRET" hint
// instead of failing the first encrypt() call deep in an OAuth callback.
export function secretIsAvailable(): boolean {
  try { getKey(); return true } catch { return false }
}
