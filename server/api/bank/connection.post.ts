// Create or replace the bank connection (single-tenant: one per account).
// The account IBAN is taken from the sender, not the request. config is
// encrypted at rest with the same key as mailbox credentials.

import { encryptSecret, secretIsAvailable } from '~~/server/utils/secrets'
import { providerFor } from '~~/server/utils/bankSync'

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
    // ebics: store the connection parameters. Activation (key exchange +
    // signed initialization letter) is a follow-up, so it stays 'pending'.
    config = {
      hostURL: String(cfg.hostURL ?? '').trim(),
      hostId: String(cfg.hostId ?? '').trim(),
      partnerId: String(cfg.partnerId ?? '').trim(),
      userId: String(cfg.userId ?? '').trim()
    }
    if (!config.hostURL || !config.hostId || !config.partnerId || !config.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'EBICS host URL, host ID, partner ID and user ID are required'
      })
    }
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
