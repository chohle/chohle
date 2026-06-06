// EBICS onboarding: the verifiable, bank-independent half of an EBICS setup —
// key generation and the initialization letter. The live handshake
// (INI/HIA/HPB key exchange) and the signed/encrypted statement download need a
// real EBICS contract to test against and land once one is available; see
// server/utils/bankSync.ts (ebicsProvider) and docs/BANK_RECONCILIATION.md.
//
// What this does today:
//   1. generateEbicsKeys() — the three RSA-2048 key pairs EBICS requires:
//        A006 bank-technical signature, E002 encryption, X002 authentication.
//   2. ebicsPublicKeyHash() — the SHA-256 hash of a public key in the EBICS
//      INI-letter representation, so the user can print the letter, sign it, and
//      mail/upload it to the bank to activate the subscriber.
//   3. buildIniLetter() — the structured letter content.
//
// The private keys are stored only inside the connection's already-encrypted
// config blob (secrets.ts); sanitizeConfig() strips them before anything is
// returned to the client.

import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'

export type EbicsVersion = 'H004' | 'H005'
export const EBICS_VERSIONS: EbicsVersion[] = ['H004', 'H005']

export interface EbicsKeyPair {
  publicKey: string // SPKI PEM
  privateKey: string // PKCS#8 PEM
}

export interface EbicsKeys {
  // Labelled by EBICS purpose. All are RSA-2048; the signing scheme (A005 vs
  // A006 etc.) is applied later during the handshake, not at generation.
  signature: EbicsKeyPair
  encryption: EbicsKeyPair
  authentication: EbicsKeyPair
  createdAt: string
}

function genRsa(): EbicsKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return { publicKey, privateKey }
}

export function generateEbicsKeys(now: string = new Date().toISOString()): EbicsKeys {
  return {
    signature: genRsa(),
    encryption: genRsa(),
    authentication: genRsa(),
    createdAt: now
  }
}

function b64urlToHex(b64url: string): string {
  return Buffer.from(b64url, 'base64url').toString('hex')
}

// hex without leading zeros, lowercase (EBICS canonical form for the hash input)
function trimHex(hex: string): string {
  const s = hex.replace(/^0+/, '').toLowerCase()
  return s.length ? s : '0'
}

/**
 * The EBICS public-key hash printed on the INI letter: SHA-256 over the ASCII
 * string "<exponent> <modulus>", where exponent and modulus are hex, lowercase,
 * leading zeros removed, separated by a single space. Returned as uppercase hex.
 *
 * NOTE: banks differ in minor letter conventions; verify the exact format
 * against the target bank's EBICS appendix during activation.
 */
export function ebicsPublicKeyHash(publicKeyPem: string): string {
  const jwk = createPublicKey(publicKeyPem).export({ format: 'jwk' }) as { n?: string; e?: string }
  if (!jwk.n || !jwk.e) throw new Error('Not an RSA public key')
  const exp = trimHex(b64urlToHex(jwk.e))
  const mod = trimHex(b64urlToHex(jwk.n))
  return createHash('sha256').update(`${exp} ${mod}`, 'ascii').digest('hex').toUpperCase()
}

// Group a hash into space-separated byte pairs for legibility on the letter.
export function formatHashForLetter(hashHex: string): string {
  return (hashHex.match(/.{2}/g) ?? []).join(' ')
}

export interface IniLetterKeyLine {
  purpose: 'signature' | 'encryption' | 'authentication'
  ebicsName: string // A006 / E002 / X002
  hash: string // grouped, uppercase
}

export interface IniLetter {
  version: EbicsVersion
  hostId: string
  partnerId: string
  userId: string
  date: string
  keys: IniLetterKeyLine[]
}

const EBICS_NAMES: Record<keyof Omit<EbicsKeys, 'createdAt'>, string> = {
  signature: 'A006',
  encryption: 'E002',
  authentication: 'X002'
}

export function buildIniLetter(
  params: { version: EbicsVersion; hostId: string; partnerId: string; userId: string },
  keys: EbicsKeys,
  date: string = new Date().toISOString().slice(0, 10)
): IniLetter {
  const line = (purpose: keyof typeof EBICS_NAMES): IniLetterKeyLine => ({
    purpose,
    ebicsName: EBICS_NAMES[purpose],
    hash: formatHashForLetter(ebicsPublicKeyHash(keys[purpose].publicKey))
  })
  return {
    version: params.version,
    hostId: params.hostId,
    partnerId: params.partnerId,
    userId: params.userId,
    date,
    keys: [line('signature'), line('encryption'), line('authentication')]
  }
}
