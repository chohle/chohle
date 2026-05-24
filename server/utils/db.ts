import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

// Single shared SQLite connection. Lives under data/ (see VISION.md), so a
// backup of that folder is a backup of everything.
export function useDb(): Database.Database {
  if (db) return db

  const file = process.env.DATABASE_PATH || 'data/batze.db'
  mkdirSync(dirname(file), { recursive: true })

  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
