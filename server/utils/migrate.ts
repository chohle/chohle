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
  },
  {
    name: '0004_attachments',
    up: `
      CREATE TABLE attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    name: '0005_holidays',
    up: `
      CREATE TABLE holidays (
        canton TEXT NOT NULL,
        year INTEGER NOT NULL,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (canton, year, date)
      )
    `
  },
  {
    name: '0006_income_sources',
    up: `
      CREATE TABLE income_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        job_title TEXT,
        salary_rappen INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CHF',
        payout_day INTEGER NOT NULL,
        canton TEXT NOT NULL,
        payout_rule TEXT NOT NULL DEFAULT 'earlier'
          CHECK (payout_rule IN ('earlier', 'later', 'none')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    name: '0007_income_payments',
    up: `
      CREATE TABLE income_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        date TEXT NOT NULL,
        amount_rappen INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (source_id, month)
      )
    `
  },
  {
    name: '0008_sender',
    up: `
      CREATE TABLE sender (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        type TEXT NOT NULL DEFAULT 'person' CHECK (type IN ('person', 'company')),
        name TEXT NOT NULL DEFAULT '',
        street TEXT NOT NULL DEFAULT '',
        zip TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'CH',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        iban TEXT NOT NULL DEFAULT '',
        uid TEXT NOT NULL DEFAULT '',
        mwst TEXT NOT NULL DEFAULT '',
        hr_number TEXT NOT NULL DEFAULT '',
        founding_year INTEGER
      )
    `
  },
  {
    name: '0009_customers',
    up: `
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'company' CHECK (type IN ('person', 'company')),
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        street TEXT,
        zip TEXT,
        city TEXT,
        country TEXT NOT NULL DEFAULT 'CH',
        language TEXT NOT NULL DEFAULT 'de',
        customer_number TEXT,
        price_category TEXT,
        discount_percent REAL NOT NULL DEFAULT 0,
        payment_term_days INTEGER NOT NULL DEFAULT 30,
        website TEXT,
        founding_year INTEGER,
        social TEXT,
        uid TEXT,
        mwst TEXT,
        hr_number TEXT,
        logo_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    name: '0010_articles',
    up: `
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        default_price_rappen INTEGER NOT NULL DEFAULT 0,
        default_mwst REAL NOT NULL DEFAULT 8.1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    name: '0011_customer_rates',
    up: `
      CREATE TABLE customer_rates (
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        price_rappen INTEGER NOT NULL,
        PRIMARY KEY (customer_id, article_id)
      )
    `
  },
  {
    name: '0012_invoices',
    up: `
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        number TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
        description TEXT NOT NULL DEFAULT '',
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT '',
        unit_price_rappen INTEGER NOT NULL DEFAULT 0,
        discount_percent REAL NOT NULL DEFAULT 0,
        mwst_percent REAL NOT NULL DEFAULT 8.1,
        position INTEGER NOT NULL DEFAULT 0
      );
    `
  },
  {
    name: '0013_sender_logo',
    up: 'ALTER TABLE sender ADD COLUMN logo_path TEXT'
  },
  {
    name: '0014_articles_customer_id',
    // NULL customer_id = a global article (shared library); set = belongs to that customer.
    up: 'ALTER TABLE articles ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE'
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