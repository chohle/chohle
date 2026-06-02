import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { isDemo } from './demo'

let db: Database.Database | null = null

// Single shared SQLite connection. Lives under data/ (see VISION.md), so a
// backup of that folder is a backup of everything.
//
// In demo mode there is no shared db: each request carries its own per-session
// sandbox, bound to event.context by the demo middleware. useEvent() (a Nitro
// auto-import, backed by async context) recovers it from any server util.
export function useDb(): Database.Database {
  if (isDemo()) {
    const event = useEvent()
    const sessionDb = event?.context?.demoDb as Database.Database | undefined
    if (!sessionDb) {
      throw new Error('demo mode: no per-session database bound to this request')
    }
    return sessionDb
  }

  if (db) return db

  const file = process.env.DATABASE_PATH || 'data/chohle.db'
  mkdirSync(dirname(file), { recursive: true })

  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
