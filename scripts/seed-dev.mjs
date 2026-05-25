// Idempotent demo data for local development. Wipes the business tables
// (keeps the owner login) and reseeds a realistic month at a glance.
//   node scripts/seed-dev.mjs
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const db = new Database(join(root, 'data', 'batze.db'))
db.pragma('foreign_keys = ON')

const chf = (amount) => Math.round(amount * 100)

// Six months ending "today" so the dashboard trend is fully populated.
const now = new Date()
const ym = (offset) => {
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const day = (offset, dd) => `${ym(offset)}-${String(dd).padStart(2, '0')}`
const months = [5, 4, 3, 2, 1, 0].map(ym)

const wipe = db.transaction(() => {
  for (const t of [
    'invoice_items', 'invoices', 'articles', 'customers',
    'income_payments', 'income_sources', 'attachments', 'expenses', 'categories'
  ]) db.prepare(`DELETE FROM ${t}`).run()
  db.prepare(`DELETE FROM sqlite_sequence WHERE name NOT IN ('owner')`).run()
})
wipe()

const insertCategory = db.prepare(
  'INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)'
)
const cat = {}
const categories = [
  ['Groceries', 'expense', '#22c55e', 'i-lucide-shopping-cart'],
  ['Dining', 'expense', '#f97316', 'i-lucide-utensils'],
  ['Transport', 'expense', '#3b82f6', 'i-lucide-car'],
  ['Rent', 'expense', '#6366f1', 'i-lucide-home'],
  ['Utilities', 'expense', '#f59e0b', 'i-lucide-plug'],
  ['Software', 'expense', '#14b8a6', 'i-lucide-smartphone'],
  ['Health', 'expense', '#ec4899', 'i-lucide-heart-pulse'],
  ['Salary', 'income', '#10b981', 'i-lucide-banknote'],
  ['Freelance', 'income', '#8b5cf6', 'i-lucide-briefcase']
]
for (const [name, type, color, icon] of categories) {
  cat[name] = insertCategory.run(name, type, color, icon).lastInsertRowid
}

const insertExpense = db.prepare(
  `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
   VALUES (?, ?, 'CHF', ?, ?, ?, ?)`
)
// [monthOffset, dayOfMonth, title, amount, category, vendor]
const expenses = [
  // current month — rich spread for the "month at a glance" screenshot
  [0, 1, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [0, 3, 'Migros weekly shop', 87.4, 'Groceries', 'Migros'],
  [0, 4, 'GA Travelcard', 340, 'Transport', 'SBB'],
  [0, 6, 'Lunch with client', 58.5, 'Dining', 'Restaurant Schiff'],
  [0, 8, 'Adobe Creative Cloud', 65.45, 'Software', 'Adobe'],
  [0, 9, 'Coop groceries', 64.2, 'Groceries', 'Coop'],
  [0, 11, 'Electricity', 112.3, 'Utilities', 'CKW'],
  [0, 12, 'Physiotherapy', 120, 'Health', 'Physio Zentrum'],
  [0, 14, 'Dinner out', 96, 'Dining', 'Trattoria Da Vinci'],
  [0, 16, 'Petrol', 78.9, 'Transport', 'Socar'],
  [0, 18, 'Mobile plan', 39, 'Utilities', 'Salt'],
  [0, 20, 'GitHub Team', 36, 'Software', 'GitHub'],
  [0, 22, 'Migros weekly shop', 91.15, 'Groceries', 'Migros'],
  // prior months — give the trend bars some shape
  [1, 5, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [1, 12, 'Groceries', 312.6, 'Groceries', 'Migros'],
  [1, 18, 'Train tickets', 154, 'Transport', 'SBB'],
  [1, 24, 'Software subscriptions', 101.45, 'Software', 'Adobe'],
  [2, 5, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [2, 14, 'Groceries', 289.3, 'Groceries', 'Coop'],
  [2, 20, 'Dentist', 240, 'Health', 'Dr. Frei'],
  [3, 5, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [3, 16, 'Groceries', 276.85, 'Groceries', 'Migros'],
  [4, 5, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [4, 19, 'Groceries', 301.2, 'Groceries', 'Coop'],
  [5, 5, 'Rent — Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [5, 21, 'Groceries', 268.4, 'Groceries', 'Migros']
]
for (const [m, d, title, amount, c, vendor] of expenses) {
  insertExpense.run(title, chf(amount), day(m, d), cat[c], vendor, null)
}

const insertSource = db.prepare(
  `INSERT INTO income_sources (company, job_title, salary_rappen, currency, payout_day, canton, payout_rule)
   VALUES (?, ?, ?, 'CHF', ?, ?, ?)`
)
const helvetia = insertSource.run('Helvetia Versicherungen', 'Software Engineer', chf(6800), 25, 'LU', 'earlier').lastInsertRowid
const studio = insertSource.run('Studio Nord (freelance)', 'UX consulting', chf(2400), 30, 'ZH', 'later').lastInsertRowid

const insertPayment = db.prepare(
  'INSERT INTO income_payments (source_id, month, date, amount_rappen) VALUES (?, ?, ?, ?)'
)
// Salary recorded for every past month; freelance for most. Current month: salary
// received, freelance still pending (left unrecorded) for a realistic mixed state.
for (const m of months) {
  insertPayment.run(helvetia, m, `${m}-25`, chf(6800))
  if (m !== months[months.length - 1]) insertPayment.run(studio, m, `${m}-30`, chf(2400))
}

db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
db.prepare(
  `UPDATE sender SET type='company', name='batze GmbH', street='Bahnhofstrasse 12',
     zip='6003', city='Luzern', country='CH', email='hello@batze.ch', phone='+41 41 555 12 34',
     website='batze.ch', iban='CH93 0076 2011 6238 5295 7', uid='CHE-123.456.789',
     mwst='CHE-123.456.789 MWST', hr_number='CH-100.4.789.012-3', founding_year=2021,
     vat_registered=1 WHERE id=1`
).run()

const insertCustomer = db.prepare(
  `INSERT INTO customers (type, name, contact_person, email, phone, street, zip, city, country,
     language, customer_number, price_category, discount_percent, payment_term_days, website,
     founding_year, uid, mwst)
   VALUES (@type, @name, @contact, @email, @phone, @street, @zip, @city, 'CH', @lang, @num,
     @price, @discount, @term, @website, @founded, @uid, @mwst)`
)
const customers = [
  { type: 'company', name: 'Müller Bau AG', contact: 'Thomas Müller', email: 'info@muellerbau.ch', phone: '+41 41 210 44 55', street: 'Industriestrasse 8', zip: '6010', city: 'Kriens', lang: 'de', num: 'K-1001', price: 'Standard', discount: 0, term: 30, website: 'muellerbau.ch', founded: 1998, uid: 'CHE-201.345.678', mwst: 'CHE-201.345.678 MWST' },
  { type: 'company', name: 'Café Zentral GmbH', contact: 'Sandra Bucher', email: 'sandra@cafezentral.ch', phone: '+41 41 410 22 33', street: 'Hirschmattstrasse 3', zip: '6003', city: 'Luzern', lang: 'de', num: 'K-1002', price: 'Standard', discount: 5, term: 14, website: 'cafezentral.ch', founded: 2015, uid: 'CHE-310.222.444', mwst: '' },
  { type: 'person', name: 'Anna Keller', contact: '', email: 'anna.keller@bluewin.ch', phone: '+41 79 333 21 10', street: 'Weinbergstrasse 41', zip: '8006', city: 'Zürich', lang: 'de', num: 'K-1003', price: '', discount: 0, term: 30, website: '', founded: null, uid: '', mwst: '' },
  { type: 'company', name: 'Studio Nord GmbH', contact: 'Luca Rossi', email: 'luca@studionord.ch', phone: '+41 44 500 90 00', street: 'Limmatstrasse 264', zip: '8005', city: 'Zürich', lang: 'de', num: 'K-1004', price: 'Premium', discount: 10, term: 30, website: 'studionord.ch', founded: 2012, uid: 'CHE-444.555.666', mwst: 'CHE-444.555.666 MWST' }
]
const customerIds = customers.map((c) => insertCustomer.run(c).lastInsertRowid)

const insertArticle = db.prepare(
  `INSERT INTO articles (name, unit, default_price_rappen, default_mwst, customer_id)
   VALUES (?, ?, ?, ?, ?)`
)
const art = {}
const articles = [
  ['Beratung', 'Stunden', 150, 8.1],
  ['Wartungsarbeiten', 'Stunden', 120, 8.1],
  ['Webdesign', 'Pauschal', 2500, 8.1],
  ['Hosting', 'Monat', 25, 8.1],
  ['Spesen', 'Pauschal', 0, 8.1]
]
for (const [name, unit, price, mwst] of articles) {
  art[name] = insertArticle.run(name, unit, chf(price), mwst, null).lastInsertRowid
}

// A few customer-specific articles so customer detail pages have bespoke items.
insertArticle.run('Retainer Betreuung', 'Monat', chf(800), 8.1, customerIds[3])
insertArticle.run('Express-Zuschlag', 'Pauschal', chf(200), 8.1, customerIds[3])
insertArticle.run('Reinigung Baustelle', 'Pauschal', chf(450), 8.1, customerIds[0])

const insertInvoice = db.prepare(
  `INSERT INTO invoices (customer_id, number, title, status, issue_date, due_date)
   VALUES (?, ?, ?, ?, ?, ?)`
)
const insertItem = db.prepare(
  `INSERT INTO invoice_items
     (invoice_id, article_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const addInvoice = (customerId, number, title, status, issueOffset, items) => {
  const issue = day(issueOffset, 6)
  const dueD = new Date(now.getFullYear(), now.getMonth() - issueOffset, 6 + 30)
  const due = `${dueD.getFullYear()}-${String(dueD.getMonth() + 1).padStart(2, '0')}-${String(dueD.getDate()).padStart(2, '0')}`
  const id = insertInvoice.run(customerId, number, title, status, issue, due).lastInsertRowid
  items.forEach((it, i) => {
    insertItem.run(id, it.article ?? null, it.desc, it.qty, it.unit ?? '', chf(it.price), it.discount ?? 0, it.mwst ?? 8.1, i)
  })
}

addInvoice(customerIds[0], '2026-001', 'Wartung Heizungssteuerung', 'paid', 2, [
  { article: art['Wartungsarbeiten'], desc: 'Wartungsarbeiten', qty: 8, unit: 'Stunden', price: 120 },
  { article: art['Spesen'], desc: 'Anfahrt', qty: 1, unit: 'Pauschal', price: 45 }
])
addInvoice(customerIds[3], '2026-002', 'Website Relaunch', 'sent', 1, [
  { article: art['Webdesign'], desc: 'Webdesign Pauschal', qty: 1, unit: 'Pauschal', price: 2500 },
  { article: art['Beratung'], desc: 'Konzept & Beratung', qty: 6, unit: 'Stunden', price: 150 },
  { article: art['Hosting'], desc: 'Hosting (Jahr)', qty: 12, unit: 'Monat', price: 25 }
])
addInvoice(customerIds[1], '2026-003', 'Beratung Digitalisierung', 'draft', 0, [
  { article: art['Beratung'], desc: 'Beratung', qty: 4, unit: 'Stunden', price: 150, discount: 5 }
])

console.log('Seeded:',
  `${categories.length} categories, ${expenses.length} expenses, 2 income sources,`,
  `${customers.length} customers, ${articles.length} articles, 3 invoices.`)
db.close()
