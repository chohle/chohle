// Create or replace the bank connection (single-tenant: one per account).
// The account IBAN is taken from the sender, not the request. config is
// encrypted at rest with the same key as mailbox credentials.

import { decryptSecret, encryptSecret, secretIsAvailable } from '~~/server/utils/secrets'
import { providerFor } from '~~/server/utils/bankSync'
import { EBICS_VERSIONS, generateEbicsKeys, type EbicsVersion } from '~~/server/utils/ebics'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const body = await readBody(event)
  const provider = String(body?.provider ?? '')
  if (!providerFor(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown provider' })
  }
  if (!secretIsAvailable()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'CHOHLE_SECRET is required to store a bank connection'
    })
  }

  const db = useDb()
  const sender = db.prepare('SELECT iban FROM sender WHERE id = 1').get() as
    | { iban: string }
    | undefined
  const iban = (sender?.iban ?? '').replace(/\s/g, '')
  if (!iban) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Set your IBAN in settings before connecting a bank'
    })
  }

  const cfg = (body?.config ?? {}) as Record<string, unknown>
  let config: Record<string, unknown>
  let status: string

  if (provider === 'folder') {
    const dir = String(cfg.dir ?? '').trim()
    if (!dir) throw createError({ statusCode: 400, statusMessage: 'A folder path is required' })
    config = { dir }
    // Ready to sync immediately.
    status = 'active'
  } else {
    // ebics: store the connection parameters AND generate the subscriber's
    // RSA key pairs now. The user then downloads the INI letter, signs it, and
    // sends it to the bank; the live key exchange + statement download land once
    // the bank activates the subscriber. So it stays 'pending' until then.
    const version = String(cfg.version ?? 'H005').trim() as EbicsVersion
    if (!EBICS_VERSIONS.includes(version)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported EBICS version' })
    }
    const base = {
      version,
      hostURL: String(cfg.hostURL ?? '').trim(),
      hostId: String(cfg.hostId ?? '').trim(),
      partnerId: String(cfg.partnerId ?? '').trim(),
      userId: String(cfg.userId ?? '').trim()
    }
    if (!base.hostURL || !base.hostId || !base.partnerId || !base.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'EBICS host URL, host ID, partner ID and user ID are required'
      })
    }
    // Reuse existing keys on an edit so we don't invalidate an in-progress
    // activation (the user may already have sent the bank a letter for them);
    // generate fresh otherwise. The whole config is encrypted at rest.
    const existing = db.prepare('SELECT config FROM bank_connections LIMIT 1').get() as
      | { config: string | null }
      | undefined
    let keys = generateEbicsKeys()
    try {
      const prev = existing?.config ? JSON.parse(decryptSecret(existing.config)) : null
      if (prev?.keys?.signature?.privateKey) keys = prev.keys
    } catch {
      /* unreadable prior config → keep the fresh keys */
    }
    config = { ...base, keys }
    status = 'pending'
  }

  const encrypted = encryptSecret(JSON.stringify(config))
  db.transaction(() => {
    db.prepare('DELETE FROM bank_connections').run()
    db.prepare(
      'INSERT INTO bank_connections (iban, provider, status, config) VALUES (?, ?, ?, ?)'
    ).run(iban, provider, status, encrypted)
  })()

  return { ok: true }
})
