// Idempotent demo data for local development. Thin CLI wrapper around the
// shared seedDemo() function (server/utils/seedDemo.ts) so the same data can be
// produced from the command line or, later, from the server.
//
//   node scripts/seed-dev.mjs            # English (default)
//   node scripts/seed-dev.mjs de         # German demo data (also: fr, it)
//   SEED_LOCALE=fr node scripts/seed-dev.mjs
//
// IMPORTANT: stop the running app first (it holds an open handle on the
// SQLite file). Then run the script. Then start the app again.
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { seedDemo, SUPPORTED_LOCALES } from '../server/utils/seedDemo.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const requested = process.argv[2] ?? process.env.SEED_LOCALE
if (requested && !SUPPORTED_LOCALES.includes(requested)) {
  console.warn(
    `Unknown locale "${requested}"; falling back to "en". Supported: ${SUPPORTED_LOCALES.join(', ')}`
  )
}

// Respect DATABASE_PATH (matches server/utils/db.ts) so we seed the same file
// the app reads — e.g. a Docker named volume — not a stale default path.
const db = new Database(process.env.DATABASE_PATH || join(root, 'data', 'chohle.db'))
const r = seedDemo(db, requested ?? 'en')
db.close()

console.log(
  `Seeded (locale: ${r.locale}):`,
  `${r.categories} categories, ${r.expenses} expenses, 2 income sources,`,
  `${r.customers} customers, ${r.articles} articles,`,
  `${r.projects} projects (8 sales + 4 procurement + 2 legacy wrappers), 2 project emails, ${r.invoices} invoices, ${r.quotes} quotes.`
)
