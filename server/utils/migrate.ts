import type { Database } from 'better-sqlite3'

interface Migration {
  name: string
  up: string
}

// Ordered, append-only. Each entry runs once; never edit an applied migration.
const migrations: Migration[] = [
  {
    name: '0001_owner',
    up: `
      CREATE TABLE owner (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL
      )
    `
  },
  {
    name: '0002_categories',
    up: `
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    name: '0003_expenses',
    up: `
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        amount_rappen INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CHF',
        date TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        vendor TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  }
]

// Applies any not-yet-run migrations inside a transaction each. Idempotent:
// safe to call on every boot.
export function runMigrations(db: Database): { applied: string[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const done = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name)
  )

  const applied: string[] = []
  for (const migration of migrations) {
    if (done.has(migration.name)) continue
    db.transaction(() => {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name)
    })()
    applied.push(migration.name)
  }
  return { applied }
}