import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../server/utils/migrate'
import { rotateStoredSecrets } from '../server/utils/secretRotation'
import { decryptSecret, encryptSecret } from '../server/utils/secrets'

const OLD_SECRET = 'old-secret-before-rotation-1234'
const NEW_SECRET = 'new-secret-after-rotation-5678'

function freshDb() {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('rotateStoredSecrets', () => {
  const originalSecret = process.env.CHOHLE_SECRET

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CHOHLE_SECRET
    else process.env.CHOHLE_SECRET = originalSecret
    delete process.env.CHOHLE_SECRET_PREVIOUS
    vi.restoreAllMocks()
  })

  it('re-encrypts every column written with the previous key or in legacy format', () => {
    const db = freshDb()
    process.env.CHOHLE_SECRET = OLD_SECRET
    db.prepare(
      `INSERT INTO mailboxes (provider, access_token_enc, refresh_token_enc, provider_client_secret_enc)
       VALUES ('gmail', ?, ?, ?)`
    ).run(encryptSecret('access'), encryptSecret('refresh'), encryptSecret('client-secret'))
    // IMAP row with a NULL token column and a legacy formatted password.
    db.prepare(`INSERT INTO mailboxes (provider, imap_password_enc) VALUES ('imap', ?)`).run(
      encryptSecret('imap-pass').replace(/^v1:/, '')
    )
    db.prepare(
      `INSERT INTO bank_connections (iban, provider, status, config) VALUES ('CH1', 'folder', 'active', ?)`
    ).run(encryptSecret(JSON.stringify({ dir: '/in' })))

    process.env.CHOHLE_SECRET = NEW_SECRET
    process.env.CHOHLE_SECRET_PREVIOUS = OLD_SECRET
    expect(rotateStoredSecrets(db)).toEqual({ checked: 5, rotated: 5, failed: 0 })

    // Everything is readable with the new key alone, in the v1 format.
    delete process.env.CHOHLE_SECRET_PREVIOUS
    const rows = db
      .prepare(
        'SELECT access_token_enc, refresh_token_enc, imap_password_enc, provider_client_secret_enc FROM mailboxes ORDER BY id'
      )
      .all() as Record<string, string | null>[]
    expect(decryptSecret(rows[0]!.access_token_enc!)).toBe('access')
    expect(decryptSecret(rows[0]!.refresh_token_enc!)).toBe('refresh')
    expect(decryptSecret(rows[0]!.provider_client_secret_enc!)).toBe('client-secret')
    expect(rows[0]!.imap_password_enc).toBeNull()
    expect(rows[1]!.imap_password_enc!.startsWith('v1:')).toBe(true)
    expect(decryptSecret(rows[1]!.imap_password_enc!)).toBe('imap-pass')
    const conn = db.prepare('SELECT config FROM bank_connections').get() as { config: string }
    expect(JSON.parse(decryptSecret(conn.config))).toEqual({ dir: '/in' })

    // Second run is a no-op.
    expect(rotateStoredSecrets(db)).toEqual({ checked: 5, rotated: 0, failed: 0 })
  })

  it('leaves rows it cannot decrypt untouched and reports them', () => {
    const db = freshDb()
    process.env.CHOHLE_SECRET = 'a-key-nobody-remembers-anymore'
    const orphan = encryptSecret('lost')
    process.env.CHOHLE_SECRET = OLD_SECRET
    const fine = encryptSecret('fine')
    db.prepare(
      `INSERT INTO mailboxes (provider, access_token_enc, refresh_token_enc) VALUES ('outlook', ?, ?)`
    ).run(orphan, fine)

    process.env.CHOHLE_SECRET = NEW_SECRET
    process.env.CHOHLE_SECRET_PREVIOUS = OLD_SECRET
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(rotateStoredSecrets(db)).toEqual({ checked: 2, rotated: 1, failed: 1 })
    expect(error).toHaveBeenCalledOnce()
    expect(String(error.mock.calls[0]![0])).toMatch(/mailboxes\.access_token_enc row 1/)

    const row = db.prepare('SELECT access_token_enc, refresh_token_enc FROM mailboxes').get() as {
      access_token_enc: string
      refresh_token_enc: string
    }
    expect(row.access_token_enc).toBe(orphan)
    expect(decryptSecret(row.refresh_token_enc)).toBe('fine')
  })

  it('does nothing on an empty database', () => {
    process.env.CHOHLE_SECRET = NEW_SECRET
    process.env.CHOHLE_SECRET_PREVIOUS = OLD_SECRET
    expect(rotateStoredSecrets(freshDb())).toEqual({ checked: 0, rotated: 0, failed: 0 })
  })
})
