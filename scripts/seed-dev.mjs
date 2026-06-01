// Idempotent demo data for local development. Wipes the business tables
// (keeps the owner login) and reseeds a realistic month at a glance plus
// a populated project pipeline.
//
//   node scripts/seed-dev.mjs
//
// IMPORTANT: stop the running app first (it holds an open handle on the
// SQLite file). Then run the script. Then start the app again.
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
  // FK order matters: child tables before parents. quote_items -> quotes,
  // and quotes references invoices(converted_invoice_id), so quotes goes
  // before invoices to avoid the FK tripping mid-wipe.
  for (const t of [
    'project_emails',
    'invoice_reminders',
    'quote_items',
    'quotes',
    'invoice_items',
    'invoices',
    'projects',
    'articles',
    'customers',
    'income_payments',
    'income_sources',
    'attachments',
    'expenses',
    'categories'
  ])
    db.prepare(`DELETE FROM ${t}`).run()
  db.prepare(`DELETE FROM sqlite_sequence WHERE name NOT IN ('owner')`).run()
})
wipe()

// --- Categories ---------------------------------------------------------
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
  ['Office', 'expense', '#a855f7', 'i-lucide-briefcase'],
  ['Salary', 'income', '#10b981', 'i-lucide-banknote'],
  ['Freelance', 'income', '#8b5cf6', 'i-lucide-briefcase']
]
for (const [name, type, color, icon] of categories) {
  cat[name] = insertCategory.run(name, type, color, icon).lastInsertRowid
}

// --- Expenses -----------------------------------------------------------
const insertExpense = db.prepare(
  `INSERT INTO expenses (title, amount_rappen, currency, date, category_id, vendor, notes)
   VALUES (?, ?, 'CHF', ?, ?, ?, ?)`
)
// [monthOffset, dayOfMonth, title, amount, category, vendor]
const expenses = [
  // current month, rich spread for the "month at a glance" screenshot
  [0, 1, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
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
  [0, 24, 'Office chair (new)', 489, 'Office', 'Pfister'],
  // prior months, give the trend bars some shape
  [1, 5, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [1, 12, 'Groceries', 312.6, 'Groceries', 'Migros'],
  [1, 18, 'Train tickets', 154, 'Transport', 'SBB'],
  [1, 24, 'Software subscriptions', 101.45, 'Software', 'Adobe'],
  [2, 5, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [2, 14, 'Groceries', 289.3, 'Groceries', 'Coop'],
  [2, 20, 'Dentist', 240, 'Health', 'Dr. Frei'],
  [3, 5, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [3, 16, 'Groceries', 276.85, 'Groceries', 'Migros'],
  [4, 5, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [4, 19, 'Groceries', 301.2, 'Groceries', 'Coop'],
  [5, 5, 'Rent, Apartment Luzern', 1650, 'Rent', 'Hausverwaltung Meier'],
  [5, 21, 'Groceries', 268.4, 'Groceries', 'Migros']
]
for (const [m, d, title, amount, c, vendor] of expenses) {
  insertExpense.run(title, chf(amount), day(m, d), cat[c], vendor, null)
}

// --- Income sources -----------------------------------------------------
const insertSource = db.prepare(
  `INSERT INTO income_sources (company, job_title, salary_rappen, currency, payout_day, canton, payout_rule)
   VALUES (?, ?, ?, 'CHF', ?, ?, ?)`
)
const helvetia = insertSource.run(
  'Helvetia Versicherungen',
  'Software Engineer',
  chf(6800),
  25,
  'LU',
  'earlier'
).lastInsertRowid
const studio = insertSource.run(
  'Studio Nord (freelance)',
  'UX consulting',
  chf(2400),
  30,
  'ZH',
  'later'
).lastInsertRowid

const insertPayment = db.prepare(
  'INSERT INTO income_payments (source_id, month, date, amount_rappen) VALUES (?, ?, ?, ?)'
)
// Salary recorded for every past month; freelance for most. Current month: salary
// received, freelance still pending (left unrecorded) for a realistic mixed state.
for (const m of months) {
  insertPayment.run(helvetia, m, `${m}-25`, chf(6800))
  if (m !== months[months.length - 1]) insertPayment.run(studio, m, `${m}-30`, chf(2400))
}

// --- Sender (your business identity) ------------------------------------
db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
db.prepare(
  `UPDATE sender SET type='company', name='batze GmbH', street='Bahnhofstrasse 12',
     zip='6003', city='Luzern', country='CH', email='hello@batze.ch', phone='+41 41 555 12 34',
     website='batze.ch', iban='CH93 0076 2011 6238 5295 7', uid='CHE-123.456.789',
     mwst='CHE-123.456.789 MWST', hr_number='CH-100.4.789.012-3', founding_year=2021,
     vat_registered=1 WHERE id=1`
).run()

// --- Customers ----------------------------------------------------------
const insertCustomer = db.prepare(
  `INSERT INTO customers (type, name, contact_person, email, phone, street, zip, city, country,
     language, customer_number, price_category, discount_percent, payment_term_days, website,
     founding_year, uid, mwst)
   VALUES (@type, @name, @contact, @email, @phone, @street, @zip, @city, 'CH', @lang, @num,
     @price, @discount, @term, @website, @founded, @uid, @mwst)`
)
const customers = [
  {
    type: 'company',
    name: 'Müller Bau AG',
    contact: 'Thomas Müller',
    email: 'info@muellerbau.ch',
    phone: '+41 41 210 44 55',
    street: 'Industriestrasse 8',
    zip: '6010',
    city: 'Kriens',
    lang: 'de',
    num: 'K-1001',
    price: 'Standard',
    discount: 0,
    term: 30,
    website: 'muellerbau.ch',
    founded: 1998,
    uid: 'CHE-201.345.678',
    mwst: 'CHE-201.345.678 MWST'
  },
  {
    type: 'company',
    name: 'Café Zentral GmbH',
    contact: 'Sandra Bucher',
    email: 'sandra@cafezentral.ch',
    phone: '+41 41 410 22 33',
    street: 'Hirschmattstrasse 3',
    zip: '6003',
    city: 'Luzern',
    lang: 'de',
    num: 'K-1002',
    price: 'Standard',
    discount: 5,
    term: 14,
    website: 'cafezentral.ch',
    founded: 2015,
    uid: 'CHE-310.222.444',
    mwst: ''
  },
  {
    type: 'person',
    name: 'Anna Keller',
    contact: '',
    email: 'anna.keller@bluewin.ch',
    phone: '+41 79 333 21 10',
    street: 'Weinbergstrasse 41',
    zip: '8006',
    city: 'Zürich',
    lang: 'de',
    num: 'K-1003',
    price: '',
    discount: 0,
    term: 30,
    website: '',
    founded: null,
    uid: '',
    mwst: ''
  },
  {
    type: 'company',
    name: 'Studio Nord GmbH',
    contact: 'Luca Rossi',
    email: 'luca@studionord.ch',
    phone: '+41 44 500 90 00',
    street: 'Limmatstrasse 264',
    zip: '8005',
    city: 'Zürich',
    lang: 'de',
    num: 'K-1004',
    price: 'Premium',
    discount: 10,
    term: 30,
    website: 'studionord.ch',
    founded: 2012,
    uid: 'CHE-444.555.666',
    mwst: 'CHE-444.555.666 MWST'
  },
  {
    type: 'company',
    name: 'Tech Hub AG',
    contact: 'Mira Holzer',
    email: 'mira@techhub.ch',
    phone: '+41 44 333 12 12',
    street: 'Europaallee 21',
    zip: '8004',
    city: 'Zürich',
    lang: 'de',
    num: 'K-1005',
    price: 'Standard',
    discount: 0,
    term: 30,
    website: 'techhub.ch',
    founded: 2019,
    uid: 'CHE-555.666.777',
    mwst: 'CHE-555.666.777 MWST'
  },
  {
    type: 'person',
    name: 'Marina Sturm',
    contact: '',
    email: 'marina.sturm@gmx.ch',
    phone: '+41 78 444 55 66',
    street: 'Bahnhofplatz 4',
    zip: '6300',
    city: 'Zug',
    lang: 'de',
    num: 'K-1006',
    price: '',
    discount: 0,
    term: 30,
    website: '',
    founded: null,
    uid: '',
    mwst: ''
  }
]
const customerIds = customers.map((c) => insertCustomer.run(c).lastInsertRowid)
const [muellerId, cafeId, annaId, studioId, techhubId, marinaId] = customerIds

// --- Articles -----------------------------------------------------------
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
// Customer specific articles so customer detail pages have bespoke items.
insertArticle.run('Retainer Betreuung', 'Monat', chf(800), 8.1, studioId)
insertArticle.run('Express-Zuschlag', 'Pauschal', chf(200), 8.1, studioId)
insertArticle.run('Reinigung Baustelle', 'Pauschal', chf(450), 8.1, muellerId)

// --- Projects (Sales + Procurement) -------------------------------------
const insertProject = db.prepare(
  `INSERT INTO projects (name, customer_id, direction, stage, label, budget_rappen,
                          budget_type, due_date, notes, position, email, phone,
                          created_at, updated_at)
   VALUES (@name, @customer_id, @direction, @stage, @label, @budget_rappen,
           @budget_type, @due_date, @notes, @position, @email, @phone,
           @created_at, @updated_at)`
)
const projectAt = (offset, dd) => day(offset, dd) + ' 09:00:00'

const projects = [
  // SALES: lead stage (x2)
  {
    name: 'Webshop Redesign',
    customer_id: techhubId,
    direction: 'sales',
    stage: 'lead',
    label: 'New storefront with checkout',
    budget_rappen: chf(8500),
    budget_type: 'fixed',
    due_date: day(0, 28),
    notes: 'First call promising. Wants mockups by end of month.',
    position: 0,
    email: 'mira@techhub.ch',
    phone: '+41 44 333 12 12',
    created_at: projectAt(0, 5),
    updated_at: projectAt(0, 12)
  },
  {
    name: 'Logo & CI',
    customer_id: marinaId,
    direction: 'sales',
    stage: 'lead',
    label: 'Personal brand identity',
    budget_rappen: chf(1500),
    budget_type: 'fixed',
    due_date: null,
    notes: '',
    position: 1,
    email: 'marina.sturm@gmx.ch',
    phone: '+41 78 444 55 66',
    created_at: projectAt(0, 8),
    updated_at: projectAt(0, 9)
  },
  // SALES: contacted (x1)
  {
    name: 'Restaurant booking system',
    customer_id: cafeId,
    direction: 'sales',
    stage: 'contacted',
    label: 'OpenTable integration',
    budget_rappen: chf(4500),
    budget_type: 'fixed',
    due_date: day(1, 15),
    notes: 'Sent reference projects.',
    position: 0,
    email: 'sandra@cafezentral.ch',
    phone: '+41 41 410 22 33',
    created_at: projectAt(1, 22),
    updated_at: projectAt(0, 3)
  },
  // SALES: proposal (x1) with email thread
  {
    name: 'Marketing site',
    customer_id: muellerId,
    direction: 'sales',
    stage: 'proposal',
    label: 'Static landing + CMS',
    budget_rappen: chf(6000),
    budget_type: 'fixed',
    due_date: day(1, 10),
    notes: 'Proposal sent, awaiting answer.',
    position: 0,
    email: 'info@muellerbau.ch',
    phone: '+41 41 210 44 55',
    created_at: projectAt(1, 18),
    updated_at: projectAt(0, 6)
  },
  // SALES: won (x1) -> has a paid invoice
  {
    name: 'Wartungsvertrag 2026',
    customer_id: muellerId,
    direction: 'sales',
    stage: 'won',
    label: 'Yearly maintenance contract',
    budget_rappen: chf(12000),
    budget_type: 'hourly',
    due_date: day(0, 6),
    notes: 'Won! Annual maintenance.',
    position: 0,
    email: 'info@muellerbau.ch',
    phone: '+41 41 210 44 55',
    created_at: projectAt(3, 14),
    updated_at: projectAt(2, 6)
  },
  // SALES: active (x2) -> currently being worked on
  {
    name: 'Website relaunch',
    customer_id: studioId,
    direction: 'sales',
    stage: 'active',
    label: 'Full redesign + migration',
    budget_rappen: chf(18000),
    budget_type: 'fixed',
    due_date: day(-1, 30),
    notes: 'In production. Phase 1 invoiced.',
    position: 0,
    email: 'luca@studionord.ch',
    phone: '+41 44 500 90 00',
    created_at: projectAt(2, 1),
    updated_at: projectAt(0, 10)
  },
  {
    name: 'Beratung Q1',
    customer_id: cafeId,
    direction: 'sales',
    stage: 'active',
    label: 'Retainer 20h/month',
    budget_rappen: chf(5000),
    budget_type: 'hourly',
    due_date: day(-2, 31),
    notes: 'Active retainer.',
    position: 1,
    email: 'sandra@cafezentral.ch',
    phone: '+41 41 410 22 33',
    created_at: projectAt(2, 8),
    updated_at: projectAt(0, 4)
  },
  // SALES: completed (x1) -> archived
  {
    name: 'Website audit',
    customer_id: annaId,
    direction: 'sales',
    stage: 'completed',
    label: 'One off audit + report',
    budget_rappen: chf(800),
    budget_type: 'fixed',
    due_date: day(3, 20),
    notes: 'Done. Invoiced and paid.',
    position: 0,
    email: 'anna.keller@bluewin.ch',
    phone: '+41 79 333 21 10',
    created_at: projectAt(4, 1),
    updated_at: projectAt(3, 22)
  },

  // PROCUREMENT: need
  {
    name: 'Team laptops',
    customer_id: null,
    direction: 'procurement',
    stage: 'need',
    label: 'Need 3 new MacBooks',
    budget_rappen: chf(9000),
    budget_type: 'estimate',
    due_date: day(0, 30),
    notes: 'Working laptops getting old.',
    position: 0,
    email: '',
    phone: '',
    created_at: projectAt(0, 2),
    updated_at: projectAt(0, 2)
  },
  // PROCUREMENT: requested
  {
    name: 'Cleaning service quotes',
    customer_id: null,
    direction: 'procurement',
    stage: 'requested',
    label: 'Weekly office cleaning',
    budget_rappen: chf(2400),
    budget_type: 'estimate',
    due_date: day(0, 25),
    notes: 'Sent RFQ to 3 suppliers.',
    position: 0,
    email: '',
    phone: '',
    created_at: projectAt(0, 4),
    updated_at: projectAt(0, 7)
  },
  // PROCUREMENT: received
  {
    name: 'Server hosting comparison',
    customer_id: null,
    direction: 'procurement',
    stage: 'received',
    label: 'EU based VPS',
    budget_rappen: chf(600),
    budget_type: 'estimate',
    due_date: null,
    notes: 'Got 3 offers. Evaluating.',
    position: 0,
    email: '',
    phone: '',
    created_at: projectAt(1, 12),
    updated_at: projectAt(0, 9)
  },
  // PROCUREMENT: accepted
  {
    name: 'Office furniture',
    customer_id: null,
    direction: 'procurement',
    stage: 'accepted',
    label: 'Standing desks + chairs',
    budget_rappen: chf(3200),
    budget_type: 'fixed',
    due_date: day(0, 22),
    notes: 'Order placed at Pfister.',
    position: 0,
    email: 'kontakt@pfister.ch',
    phone: '+41 44 500 11 22',
    created_at: projectAt(1, 28),
    updated_at: projectAt(0, 15)
  }
]
const projectIds = projects.map((p) => insertProject.run(p).lastInsertRowid)

// Pick a few project ids out by name for the email thread + invoice linking.
const proposalProjectId = projectIds[projects.findIndex((p) => p.name === 'Marketing site')]
const wonProjectId = projectIds[projects.findIndex((p) => p.name === 'Wartungsvertrag 2026')]
const activeProjectId = projectIds[projects.findIndex((p) => p.name === 'Website relaunch')]
const completedProjectId = projectIds[projects.findIndex((p) => p.name === 'Website audit')]

// --- Project email thread (on the proposal stage project) ---------------
const insertEmail = db.prepare(
  `INSERT INTO project_emails (project_id, direction, from_address, to_address,
                                subject, body_html, body_text, sent_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
insertEmail.run(
  proposalProjectId,
  'outbound',
  'hello@batze.ch',
  'info@muellerbau.ch',
  'Proposal: Marketing site',
  '<p>Hi Thomas,</p><p>Following up on our call, please find attached the proposal for the new Müller Bau marketing site.</p><p>Budget: CHF 6,000 fixed price, two milestones.</p><p>Looking forward to your feedback.</p><p>Best,<br>batze</p>',
  'Hi Thomas,\n\nFollowing up on our call, please find attached the proposal for the new Müller Bau marketing site.\n\nBudget: CHF 6,000 fixed price, two milestones.\n\nLooking forward to your feedback.\n\nBest,\nbatze',
  day(0, 6) + ' 10:32:00',
  day(0, 6) + ' 10:32:00'
)
insertEmail.run(
  proposalProjectId,
  'inbound',
  'info@muellerbau.ch',
  null,
  'Re: Proposal: Marketing site',
  '',
  'Hi, thanks. We discussed internally and want to go ahead. Can we schedule a kickoff call next week?\n\nThomas',
  day(0, 8) + ' 14:18:00',
  day(0, 8) + ' 14:18:00'
)

// --- Invoices (some linked to projects) ---------------------------------
const insertInvoice = db.prepare(
  `INSERT INTO invoices (customer_id, project_id, number, title, status, issue_date, due_date)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
)
const insertItem = db.prepare(
  `INSERT INTO invoice_items
     (invoice_id, article_id, description, quantity, unit, unit_price_rappen, discount_percent, mwst_percent, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const addInvoice = (customerId, projectId, number, title, status, issueOffset, items) => {
  const issue = day(issueOffset, 6)
  const dueD = new Date(now.getFullYear(), now.getMonth() - issueOffset, 6 + 30)
  const due = `${dueD.getFullYear()}-${String(dueD.getMonth() + 1).padStart(2, '0')}-${String(dueD.getDate()).padStart(2, '0')}`
  const id = insertInvoice.run(
    customerId,
    projectId,
    number,
    title,
    status,
    issue,
    due
  ).lastInsertRowid
  items.forEach((it, i) => {
    insertItem.run(
      id,
      it.article ?? null,
      it.desc,
      it.qty,
      it.unit ?? '',
      chf(it.price),
      it.discount ?? 0,
      it.mwst ?? 8.1,
      i
    )
  })
}

// Each invoice belongs to a project. Older invoices get small completed
// projects so the customer history is preserved without orphans.
const legacyHeatingId = insertProject.run({
  name: 'Heizungssteuerung (Wartung)',
  customer_id: muellerId,
  direction: 'sales',
  stage: 'completed',
  label: 'One off maintenance visit',
  budget_rappen: chf(1000),
  budget_type: 'fixed',
  due_date: day(5, 6),
  notes: 'Old job. Closed.',
  position: 1,
  email: 'info@muellerbau.ch',
  phone: '+41 41 210 44 55',
  created_at: projectAt(5, 1),
  updated_at: projectAt(5, 8)
}).lastInsertRowid
addInvoice(muellerId, legacyHeatingId, '2025-101', 'Wartung Heizungssteuerung', 'paid', 5, [
  {
    article: art['Wartungsarbeiten'],
    desc: 'Wartungsarbeiten',
    qty: 8,
    unit: 'Stunden',
    price: 120
  },
  { article: art['Spesen'], desc: 'Anfahrt', qty: 1, unit: 'Pauschal', price: 45 }
])

// Won project: 1 paid invoice
addInvoice(muellerId, wonProjectId, '2026-001', 'Wartungsvertrag 2026 (Q1)', 'paid', 2, [
  {
    article: art['Wartungsarbeiten'],
    desc: 'Wartung Januar bis März',
    qty: 24,
    unit: 'Stunden',
    price: 120
  },
  { article: art['Spesen'], desc: 'Anfahrten', qty: 1, unit: 'Pauschal', price: 145 }
])

// Active project: 1 paid invoice + 1 sent (awaiting payment) + 1 draft
addInvoice(studioId, activeProjectId, '2026-002', 'Website relaunch (phase 1)', 'paid', 1, [
  { article: art['Webdesign'], desc: 'Konzept und Design', qty: 1, unit: 'Pauschal', price: 6000 },
  { article: art['Beratung'], desc: 'Stakeholder Workshops', qty: 8, unit: 'Stunden', price: 150 }
])
addInvoice(studioId, activeProjectId, '2026-003', 'Website relaunch (phase 2)', 'sent', 0, [
  {
    article: art['Webdesign'],
    desc: 'Implementation Sprint 1',
    qty: 1,
    unit: 'Pauschal',
    price: 4500
  },
  { article: art['Beratung'], desc: 'Reviews und Iterationen', qty: 6, unit: 'Stunden', price: 150 }
])
addInvoice(studioId, activeProjectId, '2026-004', 'Website relaunch (phase 3)', 'draft', 0, [
  {
    article: art['Webdesign'],
    desc: 'Implementation Sprint 2',
    qty: 1,
    unit: 'Pauschal',
    price: 4500
  }
])

// Completed project: paid invoice, archived
addInvoice(annaId, completedProjectId, '2025-099', 'Website audit + report', 'paid', 3, [
  {
    article: art['Beratung'],
    desc: 'Audit, Bericht und Empfehlungen',
    qty: 4,
    unit: 'Stunden',
    price: 150
  },
  { article: art['Spesen'], desc: 'Tool-Lizenzen', qty: 1, unit: 'Pauschal', price: 200 }
])

// Quick draft invoice tied to a tiny "consulting" project for Café Zentral.
const quickConsultingId = insertProject.run({
  name: 'Digitalisierung Coaching',
  customer_id: cafeId,
  direction: 'sales',
  stage: 'active',
  label: 'One off coaching session',
  budget_rappen: chf(600),
  budget_type: 'hourly',
  due_date: day(0, 28),
  notes: 'Just bill the hours.',
  position: 2,
  email: 'sandra@cafezentral.ch',
  phone: '+41 41 410 22 33',
  created_at: projectAt(0, 4),
  updated_at: projectAt(0, 5)
}).lastInsertRowid
addInvoice(cafeId, quickConsultingId, '2026-005', 'Beratung Digitalisierung', 'draft', 0, [
  { article: art['Beratung'], desc: 'Beratung', qty: 4, unit: 'Stunden', price: 150, discount: 5 }
])

// --- Quotes (Offerten) --------------------------------------------------
// One per status so the /quotes page shows the full workflow:
// draft / sent / accepted (ready to convert) / converted (already linked
// to an invoice) / declined.
const insertQuote = db.prepare(
  `INSERT INTO quotes (customer_id, project_id, number, title, status,
                       issue_date, valid_until, converted_invoice_id,
                       accepted_at, declined_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const insertQuoteItem = db.prepare(
  `INSERT INTO quote_items
     (quote_id, article_id, description, quantity, unit, unit_price_rappen,
      discount_percent, mwst_percent, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const addQuote = (
  customerId,
  projectId,
  number,
  title,
  status,
  issueOffset,
  validityDays,
  items,
  extras = {}
) => {
  const issue = day(issueOffset, 6)
  const vd = new Date(now.getFullYear(), now.getMonth() - issueOffset, 6 + validityDays)
  const validUntil = `${vd.getFullYear()}-${String(vd.getMonth() + 1).padStart(2, '0')}-${String(vd.getDate()).padStart(2, '0')}`
  const id = insertQuote.run(
    customerId,
    projectId,
    number,
    title,
    status,
    issue,
    validUntil,
    extras.convertedInvoiceId ?? null,
    extras.acceptedAt ?? null,
    extras.declinedAt ?? null
  ).lastInsertRowid
  items.forEach((it, i) => {
    insertQuoteItem.run(
      id,
      it.article ?? null,
      it.desc,
      it.qty,
      it.unit ?? '',
      chf(it.price),
      it.discount ?? 0,
      it.mwst ?? 8.1,
      i
    )
  })
  return id
}

// Sent: waiting on the studio's "Marketing site" project proposal.
addQuote(studioId, proposalProjectId, 'Q-2026-001', 'Marketing site relaunch', 'sent', 0, 30, [
  {
    article: art['Webdesign'],
    desc: 'Konzept, Wireframes, Designsystem',
    qty: 1,
    unit: 'Pauschal',
    price: 7500
  },
  { article: art['Beratung'], desc: 'Stakeholder Workshops', qty: 12, unit: 'Stunden', price: 150 }
])

// Accepted (ready to convert): cafe wants more consulting.
addQuote(
  cafeId,
  quickConsultingId,
  'Q-2026-002',
  'Folge-Beratung Digitalisierung',
  'accepted',
  0,
  30,
  [
    {
      article: art['Beratung'],
      desc: 'Workshop und Begleitung',
      qty: 10,
      unit: 'Stunden',
      price: 150
    },
    { article: art['Spesen'], desc: 'Anfahrten', qty: 1, unit: 'Pauschal', price: 60 }
  ],
  { acceptedAt: day(0, 12) }
)

// Draft: brand new, not sent yet. No project link to demo the "no project"
// guard on the Convert button.
addQuote(annaId, null, 'Q-2026-003', 'Branding refresh', 'draft', 0, 30, [
  { article: art['Webdesign'], desc: 'Logo Variationen', qty: 1, unit: 'Pauschal', price: 1800 },
  { article: art['Beratung'], desc: 'Strategiegespräch', qty: 3, unit: 'Stunden', price: 150 }
])

// Declined: customer said no. Surfaces under the Declined filter.
addQuote(
  techhubId,
  null,
  'Q-2025-099',
  'IT-Audit Q4',
  'declined',
  2,
  14,
  [
    {
      article: art['Beratung'],
      desc: 'Audit, Bericht und Empfehlungen',
      qty: 16,
      unit: 'Stunden',
      price: 150
    }
  ],
  { declinedAt: day(2, 20) }
)

// Already converted: this quote turned into invoice 2026-002 (the studio's
// Website relaunch phase 1). Surfaces with a "Converted to ..." banner and
// no Convert button.
const phase1InvoiceId = db.prepare("SELECT id FROM invoices WHERE number = '2026-002'").get().id
addQuote(
  studioId,
  activeProjectId,
  'Q-2026-000',
  'Website relaunch (Angebot)',
  'accepted',
  1,
  30,
  [
    {
      article: art['Webdesign'],
      desc: 'Konzept und Design',
      qty: 1,
      unit: 'Pauschal',
      price: 6000
    },
    { article: art['Beratung'], desc: 'Stakeholder Workshops', qty: 8, unit: 'Stunden', price: 150 }
  ],
  { convertedInvoiceId: phase1InvoiceId, acceptedAt: day(1, 6) }
)

// 2 extra projects are inserted later (legacyHeating + quickConsulting), so
// add them to the count for an accurate summary.
console.log(
  'Seeded:',
  `${categories.length} categories, ${expenses.length} expenses, 2 income sources,`,
  `${customers.length} customers, ${articles.length + 3} articles,`,
  `${projects.length + 2} projects (8 sales + 4 procurement + 2 legacy wrappers), 2 project emails, 7 invoices, 5 quotes.`
)
db.close()
