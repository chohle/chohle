// AES-256-GCM symmetric encryption for at-rest secrets (OAuth tokens,
// IMAP passwords, bank connection configs). Keys are derived from
// `process.env.CHOHLE_SECRET` via SHA-256 so any non-empty string yields a
// valid 32-byte key.
//
// Stored format: `v1:<iv hex>:<authTag hex>:<ciphertext hex>`, one
// self-contained TEXT column with no separate IV storage. Rows written before
// the version prefix existed look like `<iv hex>:<authTag hex>:<ciphertext hex>`
// and stay readable; they are rewritten in the v1 format the next time they
// are re-encrypted. The 12-byte IV is generated fresh per encryption (NIST
// recommends 96 bits for GCM); never reused for the same key.
//
// Key rotation: set CHOHLE_SECRET to the new value and CHOHLE_SECRET_PREVIOUS
// to the old one (comma separated if there are several). decryptSecret tries
// the current key first and falls back to the previous keys; GCM's auth tag
// tells us which key matched, so a wrong key can never yield garbage. The
// startup pass in server/plugins/02.rotate-secrets.ts then re-encrypts every
// stored secret with the current key so CHOHLE_SECRET_PREVIOUS can be removed.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const FORMAT_VERSION = 'v1'
const MIN_SECRET_LENGTH = 16

interface Keys {
  current: Buffer
  previous: Buffer[]
}

// Cache keyed on the raw env values so a change at runtime (tests, or a
// process manager reloading env) is picked up without a restart.
let cached: { signature: string; keys: Keys } | null = null

function deriveKey(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest()
}

function previousSecrets(): string[] {
  return (process.env.CHOHLE_SECRET_PREVIOUS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function getKeys(): Keys {
  const raw = process.env.CHOHLE_SECRET
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new Error('CHOHLE_SECRET is required (16+ chars) to encrypt mailbox credentials')
  }
  const previous = previousSecrets()
  const signature = [raw, ...previous].join('\0')
  if (cached?.signature === signature) return cached.keys

  for (const p of previous) {
    if (p.length < MIN_SECRET_LENGTH) {
      throw new Error('every CHOHLE_SECRET_PREVIOUS entry must be 16+ chars')
    }
  }
  const keys: Keys = {
    current: deriveKey(raw),
    previous: previous.filter((p) => p !== raw).map(deriveKey)
  }
  cached = { signature, keys }
  return keys
}

interface Parsed {
  iv: Buffer
  tag: Buffer
  data: Buffer
  // True for rows in the pre-v1 format without a version prefix.
  legacy: boolean
}

function parseStored(stored: string): Parsed {
  const parts = stored.split(':')
  let legacy: boolean
  let segments: string[]
  if (parts.length === 4) {
    if (parts[0] !== FORMAT_VERSION) {
      throw new Error(`encrypted secret has unsupported version "${parts[0]}"`)
    }
    legacy = false
    segments = parts.slice(1)
  } else if (parts.length === 3) {
    legacy = true
    segments = parts
  } else {
    throw new Error('encrypted secret is malformed')
  }
  const [ivHex, tagHex, dataHex] = segments
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('encrypted secret is malformed')
  }
  return {
    iv: Buffer.from(ivHex, 'hex'),
    tag: Buffer.from(tagHex, 'hex'),
    data: Buffer.from(dataHex, 'hex'),
    legacy
  }
}

function decryptWith(key: Buffer, parsed: Parsed): string {
  const decipher = createDecipheriv(ALGO, key, parsed.iv)
  decipher.setAuthTag(parsed.tag)
  return Buffer.concat([decipher.update(parsed.data), decipher.final()]).toString('utf8')
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, getKeys().current, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${FORMAT_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export interface DecryptedSecret {
  plain: string
  // True when the stored value should be re-encrypted: it was written with
  // a previous key, or in the legacy format without a version prefix.
  stale: boolean
}

export function decryptSecretDetailed(stored: string): DecryptedSecret {
  const parsed = parseStored(stored)
  const keys = getKeys()
  try {
    return { plain: decryptWith(keys.current, parsed), stale: parsed.legacy }
  } catch (err) {
    if (!keys.previous.length) throw err
  }
  for (const key of keys.previous) {
    try {
      return { plain: decryptWith(key, parsed), stale: true }
    } catch {
      // Wrong key (auth tag mismatch) or tampered data, try the next one.
    }
  }
  throw new Error(
    'encrypted secret could not be decrypted with CHOHLE_SECRET or any CHOHLE_SECRET_PREVIOUS'
  )
}

export function decryptSecret(stored: string): string {
  return decryptSecretDetailed(stored).plain
}

// `secretIsAvailable` lets the UI surface a helpful "set CHOHLE_SECRET" hint
// instead of failing the first encrypt() call deep in an OAuth callback.
export function secretIsAvailable(): boolean {
  try {
    getKeys()
    return true
  } catch {
    return false
  }
}

// True when the operator is mid rotation (CHOHLE_SECRET_PREVIOUS is set).
export function hasPreviousSecret(): boolean {
  return previousSecrets().length > 0
}
