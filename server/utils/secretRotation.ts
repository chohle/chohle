// Re-encrypts every stored secret with the current CHOHLE_SECRET. Used by the
// startup pass in server/plugins/02.rotate-secrets.ts while the operator has
// CHOHLE_SECRET_PREVIOUS set. Rows already written with the current key in the
// v1 format are left untouched, so the pass is idempotent and cheap to re-run.

import type { Database } from 'better-sqlite3'
import { decryptSecretDetailed, encryptSecret } from './secrets'

// Every column that holds a value produced by encryptSecret. Keep in sync
// with the migrations that add encrypted columns.
const ENCRYPTED_COLUMNS: Array<{ table: string; columns: string[] }> = [
  {
    table: 'mailboxes',
    columns: [
      'access_token_enc',
      'refresh_token_enc',
      'imap_password_enc',
      'provider_client_secret_enc'
    ]
  },
  { table: 'bank_connections', columns: ['config'] }
]

export interface RotationResult {
  // Non-null encrypted values inspected.
  checked: number
  // Values rewritten with the current key.
  rotated: number
  // Values that decrypt with neither the current nor a previous key. They
  // are left as they were and reported so the operator can reconnect them.
  failed: number
}

export function rotateStoredSecrets(db: Database): RotationResult {
  const result: RotationResult = { checked: 0, rotated: 0, failed: 0 }

  const run = db.transaction(() => {
    for (const { table, columns } of ENCRYPTED_COLUMNS) {
      const rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all() as Array<
        { id: number } & Record<string, string | null>
      >
      for (const row of rows) {
        for (const column of columns) {
          const stored = row[column]
          if (!stored) continue
          result.checked++
          let decrypted
          try {
            decrypted = decryptSecretDetailed(stored)
          } catch (err) {
            result.failed++
            console.error(
              `[secrets] ${table}.${column} row ${row.id} cannot be decrypted, leaving it as is:`,
              err instanceof Error ? err.message : err
            )
            continue
          }
          if (!decrypted.stale) continue
          db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(
            encryptSecret(decrypted.plain),
            row.id
          )
          result.rotated++
        }
      }
    }
  })
  run()
  return result
}
