import type { Database } from 'better-sqlite3'

interface Migration {
  name: string
  up: string
  // When true, runMigrations disables foreign keys *outside* the migration
  // transaction (PRAGMA foreign_keys cannot be toggled while a transaction
  // is active; it would silently no-op). Use this for any migration that
  // does a table rebuild (CREATE _new + DROP + RENAME) on a table that is
  // referenced by foreign keys, otherwise DROP TABLE triggers an implicit
  // DELETE that cascades to the referring rows.
  fkOff?: boolean
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
  },
  {
    name: '0015_drop_customer_rates',
    // Superseded by per-customer articles; price overrides are no longer a separate concept.
    up: 'DROP TABLE IF EXISTS customer_rates'
  },
  {
    name: '0016_sender_vat',
    // Whether the owner charges MWST. Off (e.g. a private person under the CHF 100k
    // threshold) means invoices carry no VAT.
    up: 'ALTER TABLE sender ADD COLUMN vat_registered INTEGER NOT NULL DEFAULT 0'
  },
  {
    name: '0017_owner_locale',
    up: "ALTER TABLE owner ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'"
  },
  {
    name: '0018_sender_email_template',
    // HTML cover message sent with the invoice. Placeholders {customer} {number}
    // {due} {sender} are filled in per send; header/footer are added on send.
    up: "ALTER TABLE sender ADD COLUMN email_template TEXT NOT NULL DEFAULT '<p>Guten Tag {customer}</p><p>anbei erhalten Sie die Rechnung {number}, zahlbar bis {due}.</p><p>Freundliche Grüsse<br>{sender}</p>'"
  },
  {
    name: '0019_invoice_paid_at',
    // When an invoice was marked paid; drives realized revenue per month.
    // Backfill existing paid invoices to their issue date.
    up: `
      ALTER TABLE invoices ADD COLUMN paid_at TEXT;
      UPDATE invoices SET paid_at = issue_date WHERE status = 'paid';
    `
  },
  {
    name: '0020_invoice_total_snapshot',
    // Total frozen when an invoice is marked paid, so realized revenue stays
    // stable even if items or VAT registration change later. Backfilled for
    // existing paid invoices by the backfill-invoice-totals server plugin.
    up: 'ALTER TABLE invoices ADD COLUMN total_rappen INTEGER'
  },
  {
    name: '0021_invoice_step',
    // Wizard position (0 draft, 1 send, 2 paid) so reopening a draft resumes on
    // the send screen instead of resetting to draft. Once sent/paid the status
    // decides, so backfill those to the final step.
    up: `
      ALTER TABLE invoices ADD COLUMN step INTEGER NOT NULL DEFAULT 0;
      UPDATE invoices SET step = 2 WHERE status IN ('sent', 'paid');
    `
  },
  {
    name: '0022_deals',
    // Sales pipeline / kanban deals. customer_id is optional so leads that
    // aren't customers yet can live here as free-text names. position is a
    // per-stage ordering used by the drag-and-drop UI.
    up: `
      CREATE TABLE deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'contacted', 'proposal', 'won')),
        label TEXT NOT NULL DEFAULT '',
        value_rappen INTEGER NOT NULL DEFAULT 0,
        due_date TEXT,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_deals_stage_position ON deals (stage, position);
    `
  },
  {
    name: '0023_deals_direction',
    // Procurement pipeline alongside sales. SQLite can't alter CHECK
    // constraints in place, so rebuild: copy rows into a new table with
    // the expanded stage CHECK and a direction column, then swap.
    //   sales      → stages: lead / contacted / proposal / won
    //   procurement → stages: need / requested / received / accepted
    // Existing rows default to direction='sales'.
    up: `
      DROP INDEX IF EXISTS idx_deals_stage_position;
      CREATE TABLE deals_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        direction TEXT NOT NULL DEFAULT 'sales' CHECK (direction IN ('sales', 'procurement')),
        stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN (
          'lead', 'contacted', 'proposal', 'won',
          'need', 'requested', 'received', 'accepted'
        )),
        label TEXT NOT NULL DEFAULT '',
        value_rappen INTEGER NOT NULL DEFAULT 0,
        due_date TEXT,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO deals_new (id, name, customer_id, direction, stage, label, value_rappen,
                             due_date, notes, position, created_at, updated_at)
        SELECT id, name, customer_id, 'sales', stage, label, value_rappen,
               due_date, notes, position, created_at, updated_at
        FROM deals;
      DROP TABLE deals;
      ALTER TABLE deals_new RENAME TO deals;
      CREATE INDEX idx_deals_direction_stage_position ON deals (direction, stage, position);
    `
  },
  {
    name: '0024_deal_emails',
    // Per-deal email thread. Outbound rows are emails we sent through the
    // SMTP transport; inbound rows are replies the user pasted in manually
    // (no IMAP polling — the user owns logging incoming messages).
    up: `
      CREATE TABLE deal_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
        from_address TEXT,
        to_address TEXT,
        subject TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_deal_emails_deal_sent_at ON deal_emails (deal_id, sent_at);
    `
  },
  {
    name: '0025_deals_contact',
    // Inline contact fields so a deal can carry a lead's name + email
    // before any customer record exists. When customer_id IS set, these
    // fall back to the customer's own contact details on read.
    up: `
      ALTER TABLE deals ADD COLUMN email TEXT;
      ALTER TABLE deals ADD COLUMN phone TEXT;
    `
  },
  {
    name: '0026_rename_deals_to_projects',
    // Reframe the pipeline entity. A "deal" was always the pre and post sale
    // entity carrying the customer link, value, and lifecycle stage; calling
    // it a "project" matches how the user thinks about engagements (Moco
    // style: project IS the central entity, invoices and expenses hang off
    // it). `value_rappen` becomes `budget_rappen` and we add `budget_type`
    // ('fixed' | 'hourly' | 'estimate') to support different billing models.
    up: `
      ALTER TABLE deals RENAME TO projects;
      ALTER TABLE projects RENAME COLUMN value_rappen TO budget_rappen;
      ALTER TABLE projects ADD COLUMN budget_type TEXT NOT NULL DEFAULT 'fixed';

      ALTER TABLE deal_emails RENAME TO project_emails;
      ALTER TABLE project_emails RENAME COLUMN deal_id TO project_id;
      DROP INDEX IF EXISTS idx_deal_emails_deal_sent_at;
      CREATE INDEX idx_project_emails_project_sent_at ON project_emails (project_id, sent_at);
    `
  },
  {
    name: '0027_invoices_project_id',
    // Connect invoices back to the project that produced them so the project
    // detail page can show a budget burn (sum of invoiced totals vs the
    // project budget) and so the link survives even after the project is
    // archived. SET NULL on delete keeps the invoice intact if the project
    // ever gets removed.
    up: `
      ALTER TABLE invoices ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
      CREATE INDEX idx_invoices_project_id ON invoices (project_id);
    `
  },
  {
    name: '0028_projects_active_completed_stages',
    fkOff: true,
    // Adds 'active' and 'completed' to the sales project lifecycle. SQLite
    // can't widen a CHECK in place, so we rebuild the table without a stage
    // CHECK and rely on server side validation (which knows the allowed set
    // per direction). `fkOff` tells runMigrations to disable foreign keys
    // *outside* the migration transaction (PRAGMA foreign_keys is a no-op
    // inside one); otherwise the DROP TABLE projects would implicitly
    // DELETE the rows, cascading into project_emails (ON DELETE CASCADE)
    // and nulling out invoices.project_id (ON DELETE SET NULL).
    up: `
      DROP INDEX IF EXISTS idx_deals_direction_stage_position;
      DROP INDEX IF EXISTS idx_projects_direction_stage_position;
      CREATE TABLE projects_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        direction TEXT NOT NULL DEFAULT 'sales' CHECK (direction IN ('sales', 'procurement')),
        stage TEXT NOT NULL DEFAULT 'lead',
        label TEXT NOT NULL DEFAULT '',
        budget_rappen INTEGER NOT NULL DEFAULT 0,
        budget_type TEXT NOT NULL DEFAULT 'fixed',
        due_date TEXT,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        email TEXT,
        phone TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO projects_new (id, name, customer_id, direction, stage, label,
                                budget_rappen, budget_type, due_date, notes,
                                position, email, phone, created_at, updated_at)
        SELECT id, name, customer_id, direction, stage, label,
               budget_rappen, budget_type, due_date, notes,
               position, email, phone, created_at, updated_at
        FROM projects;
      DROP TABLE projects;
      ALTER TABLE projects_new RENAME TO projects;
      CREATE INDEX idx_projects_direction_stage_position ON projects (direction, stage, position);
    `
  },
  {
    name: '0029_invoices_require_project',
    fkOff: true,
    // Project becomes mandatory on every invoice. The model is "Customer
    // has Projects, Project has Invoices". We backfill every existing
    // standalone invoice with a small placeholder project named after the
    // invoice title (or its number) so the link is never null. After the
    // backfill, the invoices table is rebuilt with NOT NULL on project_id
    // so the database enforces it. `fkOff` keeps the DROP TABLE invoices
    // from cascading into invoice_items (ON DELETE CASCADE) during the
    // rebuild.
    up: `
      -- 1. backfill: create a placeholder project per orphan invoice
      INSERT INTO projects (name, customer_id, direction, stage, label, budget_rappen,
                            budget_type, position, created_at, updated_at)
        SELECT
          CASE WHEN TRIM(i.title) = '' THEN 'Invoice ' || i.number ELSE i.title END,
          i.customer_id,
          'sales',
          'completed',
          'Auto-created from legacy invoice',
          0,
          'fixed',
          0,
          i.created_at,
          datetime('now')
        FROM invoices i
        WHERE i.project_id IS NULL;

      -- 2. link each orphan invoice to its newly minted project. We match
      -- by the invoice number embedded in the project name (or by the
      -- title) plus the customer to stay precise across rows.
      UPDATE invoices AS i
      SET project_id = (
        SELECT p.id FROM projects p
        WHERE p.customer_id = i.customer_id
          AND p.stage = 'completed'
          AND p.label = 'Auto-created from legacy invoice'
          AND p.name = CASE WHEN TRIM(i.title) = '' THEN 'Invoice ' || i.number ELSE i.title END
        ORDER BY p.id ASC
        LIMIT 1
      )
      WHERE i.project_id IS NULL;

      -- 3. rebuild invoices with NOT NULL on project_id. SQLite can't ALTER
      -- a column to add NOT NULL in place, so we copy through a new table.
      -- runMigrations disabled foreign keys before this transaction (see
      -- the fkOff flag) so the DROP+RENAME does not cascade into
      -- invoice_items.
      CREATE TABLE invoices_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        number TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        paid_at TEXT,
        total_rappen INTEGER,
        step INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO invoices_new (id, customer_id, project_id, number, title, status,
                                issue_date, due_date, paid_at, total_rappen, step, created_at)
        SELECT id, customer_id, project_id, number, title, status,
               issue_date, due_date, paid_at, total_rappen, step, created_at
        FROM invoices;
      DROP TABLE invoices;
      ALTER TABLE invoices_new RENAME TO invoices;
      CREATE INDEX idx_invoices_project_id ON invoices (project_id);
    `
  },
  {
    name: '0030_email_sync_scaffolding',
    // Capture each outbound email's RFC 5322 Message-ID so future sync
    // workers can thread inbound replies via In-Reply-To / References headers
    // (the "only log replies to mail we actually sent" rule). Also add a
    // `mailboxes` table that the upcoming Microsoft Graph / Gmail / IMAP
    // drivers will populate with one row per connected account.
    up: `
      ALTER TABLE project_emails ADD COLUMN message_id TEXT;
      CREATE INDEX idx_project_emails_message_id ON project_emails (message_id);

      CREATE TABLE mailboxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK (provider IN ('outlook', 'gmail', 'imap')),
        label TEXT NOT NULL DEFAULT '',
        email_address TEXT,
        -- Encrypted with CHOHLE_SECRET (see server/utils/secrets.ts).
        access_token_enc TEXT,
        refresh_token_enc TEXT,
        token_expires_at TEXT,
        -- IMAP only.
        imap_host TEXT,
        imap_port INTEGER,
        imap_user TEXT,
        imap_password_enc TEXT,
        imap_tls INTEGER NOT NULL DEFAULT 1,
        last_sync_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    name: '0031_mailboxes_provider_app_ids',
    // Store the OAuth app's client_id (+ tenant_id for Outlook) on the
    // mailbox row so the sync worker can refresh access tokens later. We
    // can't extract these from the stored access token alone.
    up: `
      ALTER TABLE mailboxes ADD COLUMN provider_client_id TEXT;
      ALTER TABLE mailboxes ADD COLUMN provider_tenant_id TEXT;
    `
  },
  {
    name: '0032_mailboxes_provider_client_secret',
    // Google's Web OAuth client requires a client_secret on the token
    // exchange even when PKCE is in use (only Desktop/Installed client
    // types skip it, and those need loopback redirects which don't fit
    // hosted chohle). Stored encrypted at rest like the tokens.
    up: `
      ALTER TABLE mailboxes ADD COLUMN provider_client_secret_enc TEXT;
    `
  },
  {
    name: '0033_invoice_reminders',
    // Mahnungen / overdue payment reminders. Three escalation levels per
    // Swiss practice; each level has its own subject + body template +
    // wait days (days to wait after due date for level 1, then after
    // the previous reminder for levels 2 and 3). Sent reminders log to
    // invoice_reminders so we can show history per invoice, compute
    // eligibility for the next level, and dedup ("already sent today").
    up: `
      CREATE TABLE invoice_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        subject TEXT NOT NULL,
        body TEXT NOT NULL
      );
      CREATE INDEX idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);

      ALTER TABLE sender ADD COLUMN reminder1_wait_days INTEGER NOT NULL DEFAULT 7;
      ALTER TABLE sender ADD COLUMN reminder1_subject TEXT NOT NULL DEFAULT 'Zahlungserinnerung Rechnung {number}';
      ALTER TABLE sender ADD COLUMN reminder1_body TEXT NOT NULL DEFAULT '<p>Guten Tag {customer}</p><p>vermutlich entgangen: die Rechnung {number} vom {issued} über CHF {amount} ist seit dem {due} fällig.</p><p>Wir bitten Sie, den Betrag in den nächsten Tagen zu überweisen.</p><p>Freundliche Grüsse<br>{sender}</p>';

      ALTER TABLE sender ADD COLUMN reminder2_wait_days INTEGER NOT NULL DEFAULT 14;
      ALTER TABLE sender ADD COLUMN reminder2_subject TEXT NOT NULL DEFAULT '2. Mahnung Rechnung {number}';
      ALTER TABLE sender ADD COLUMN reminder2_body TEXT NOT NULL DEFAULT '<p>Guten Tag {customer}</p><p>trotz unserer ersten Zahlungserinnerung ist die Rechnung {number} über CHF {amount} (fällig seit {due}, {days_overdue} Tage überfällig) weiterhin offen.</p><p>Wir bitten Sie, den Betrag umgehend zu begleichen.</p><p>Freundliche Grüsse<br>{sender}</p>';

      ALTER TABLE sender ADD COLUMN reminder3_wait_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE sender ADD COLUMN reminder3_subject TEXT NOT NULL DEFAULT 'Letzte Mahnung Rechnung {number}';
      ALTER TABLE sender ADD COLUMN reminder3_body TEXT NOT NULL DEFAULT '<p>Guten Tag {customer}</p><p>die Rechnung {number} über CHF {amount} ist seit {days_overdue} Tagen überfällig. Sollte der Betrag nicht innert 10 Tagen eingehen, leiten wir rechtliche Schritte ein.</p><p>Freundliche Grüsse<br>{sender}</p>';
    `
  },
  {
    name: '0034_quotes',
    // Quotes (Offerten / Angebote / Devis / Offerte). Pre-sale documents
    // that turn into invoices once the customer accepts. Same shape as
    // invoices minus QR-bill semantics: no due_date (quotes aren't paid),
    // optional valid_until for the offer expiry, separate Q-YYYY-NNN
    // number sequence, and a converted_invoice_id pointer so we don't
    // ever convert the same quote twice.
    up: `
      CREATE TABLE quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        number TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
        issue_date TEXT NOT NULL,
        valid_until TEXT,
        total_rappen INTEGER,
        converted_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        accepted_at TEXT,
        declined_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_quotes_customer ON quotes(customer_id);
      CREATE INDEX idx_quotes_project ON quotes(project_id);

      CREATE TABLE quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
        description TEXT NOT NULL DEFAULT '',
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT '',
        unit_price_rappen INTEGER NOT NULL DEFAULT 0,
        discount_percent REAL NOT NULL DEFAULT 0,
        mwst_percent REAL NOT NULL DEFAULT 8.1,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
    `
  },
  {
    name: '0035_project_emails_message_id_unique',
    // Harden inbound dedup with a DB-level guarantee instead of relying only
    // on each sync worker's in-memory Set. First null out the legacy demo
    // sentinel ('demo-suppressed', stored once per suppressed outbound email
    // in demo mode) and any other duplicate message_ids — keeping the earliest
    // row of each group — so the unique index can be created on existing data.
    // The index is partial (WHERE message_id IS NOT NULL) so manually logged
    // replies, which have no Message-ID, are unaffected.
    up: `
      UPDATE project_emails SET message_id = NULL WHERE message_id = 'demo-suppressed';
      UPDATE project_emails SET message_id = NULL
      WHERE message_id IS NOT NULL
        AND id NOT IN (
          SELECT MIN(id) FROM project_emails
          WHERE message_id IS NOT NULL GROUP BY message_id
        );
      DROP INDEX IF EXISTS idx_project_emails_message_id;
      CREATE UNIQUE INDEX idx_project_emails_message_id
        ON project_emails (message_id) WHERE message_id IS NOT NULL;
    `
  },
  {
    name: '0036_inbound_triage',
    // Inbound that doesn't thread to any project we wrote used to be dropped.
    // Park it here instead with a non-binding suggested project (derived from
    // the sender address) so the user can review and assign it — capturing
    // cold inbound and header-stripped replies WITHOUT ever auto-mis-filing.
    // assigned/dismissed rows are kept as tombstones so a later sync doesn't
    // re-triage the same message; the unique message_id index enforces that.
    up: `
      CREATE TABLE inbound_triage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mailbox_id INTEGER REFERENCES mailboxes(id) ON DELETE CASCADE,
        message_id TEXT,
        in_reply_to TEXT,
        references_ids TEXT,
        from_address TEXT,
        to_address TEXT,
        subject TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        sent_at TEXT,
        suggested_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        suggested_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'assigned', 'dismissed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_inbound_triage_message_id
        ON inbound_triage (message_id) WHERE message_id IS NOT NULL;
      CREATE INDEX idx_inbound_triage_status ON inbound_triage (status, sent_at);
    `
  },
  {
    name: '0037_signatures',
    // Reusable email sign-off blocks. The user creates named signatures (rich
    // HTML, can include an uploaded photo) and picks one when composing; it's
    // rendered into the branded email's signature slot. At most one is_default=1
    // is enforced in the API, not the schema.
    up: `
      CREATE TABLE signatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    name: '0038_bank_imports',
    // One row per imported camt.053 statement. The statement account (iban)
    // is validated against sender.iban at import time so a statement for the
    // wrong account is rejected before any transactions are stored.
    up: `
      CREATE TABLE bank_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        iban TEXT NOT NULL,
        statement_id TEXT,
        from_date TEXT,
        to_date TEXT,
        tx_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    name: '0039_bank_transactions',
    // The incoming (CRDT) credit transactions parsed out of a statement. The
    // unique dedupe_hash makes re-importing an overlapping statement safe:
    // camt.053 files overlap at period boundaries, so inserts use
    // INSERT OR IGNORE keyed on this hash. invoice_id is set once a credit is
    // matched (auto or confirmed) to the invoice it pays.
    up: `
      CREATE TABLE bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES bank_imports(id) ON DELETE CASCADE,
        booking_date TEXT NOT NULL,
        value_date TEXT,
        amount_rappen INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CHF',
        reference TEXT,
        end_to_end_id TEXT,
        debtor_name TEXT,
        acct_svcr_ref TEXT,
        dedupe_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unmatched'
          CHECK (status IN ('unmatched', 'suggested', 'matched', 'ignored')),
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_bank_tx_dedupe ON bank_transactions(dedupe_hash);
      CREATE INDEX idx_bank_tx_import ON bank_transactions(import_id);
      CREATE INDEX idx_bank_tx_status ON bank_transactions(status);
      CREATE INDEX idx_bank_tx_invoice ON bank_transactions(invoice_id);
    `
  },
  {
    name: '0040_bank_connections',
    // An automatic ingest path that fetches camt.053 on a schedule, as an
    // alternative to manual upload. Provider-agnostic: the scheduled job hands
    // whatever it fetches to the same reconcileStatement. config holds the
    // provider's parameters as encrypted JSON (folder dir; or EBICS host/IDs
    // and, later, keys) — encrypted with the same secrets.ts key as mailbox
    // credentials. Single-tenant: one connection per account (UNIQUE iban).
    up: `
      CREATE TABLE bank_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iban TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('folder', 'ebics')),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'active', 'disabled', 'error')),
        config TEXT,
        last_sync_at TEXT,
        last_status TEXT CHECK (last_status IN ('ok', 'error')),
        last_error TEXT,
        last_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX idx_bank_conn_iban ON bank_connections(iban);
    `
  },
  {
    name: '0041_quote_documents',
    // Free-form rich documents attached to a quote (cover letter, detailed
    // proposal, scope, …) written in-app and rendered to PDF as email
    // attachments. `content` is TipTap JSON; `attach` toggles whether it's
    // included when the quote is emailed.
    up: `
      CREATE TABLE quote_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        attach INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_quote_documents_quote ON quote_documents (quote_id, sort_order);
    `
  },
  {
    name: '0042_quote_item_article_name',
    // Quotes allow a free-typed article name per line (not tied to the saved
    // article catalog). article_id stays for autofill convenience but is no
    // longer required.
    up: `ALTER TABLE quote_items ADD COLUMN article_name TEXT NOT NULL DEFAULT '';`
  },
  {
    name: '0043_quote_references',
    // Reference / example links shown on a quote (e.g. links to past work),
    // rendered into the quote PDF. Replaced wholesale on each quote save.
    up: `
      CREATE TABLE quote_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_quote_references_quote ON quote_references (quote_id, sort_order);
    `
  },
  {
    name: '0044_quote_document_files',
    // A quote document is either editor-written (kind='editor', rendered from
    // `content`) or an uploaded file (kind='file': PDF/DOCX/… attached as-is).
    up: `
      ALTER TABLE quote_documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'editor';
      ALTER TABLE quote_documents ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_documents ADD COLUMN file_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_documents ADD COLUMN mime TEXT NOT NULL DEFAULT '';
    `
  },
  {
    name: '0045_quote_documents_checks',
    // Lock the two discriminator columns to their valid values at the DB level
    // (defence in depth — the app already only writes these). SQLite can't add
    // a CHECK to an existing column, so rebuild the table and copy the rows.
    up: `
      CREATE TABLE quote_documents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        attach INTEGER NOT NULL DEFAULT 1 CHECK (attach IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        kind TEXT NOT NULL DEFAULT 'editor' CHECK (kind IN ('editor', 'file')),
        file_name TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL DEFAULT '',
        mime TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO quote_documents_new
        (id, quote_id, title, content, attach, sort_order, created_at, updated_at,
         kind, file_name, file_path, mime)
        SELECT id, quote_id, title, content, attach, sort_order, created_at, updated_at,
         kind, file_name, file_path, mime
        FROM quote_documents;
      DROP TABLE quote_documents;
      ALTER TABLE quote_documents_new RENAME TO quote_documents;
      CREATE INDEX idx_quote_documents_quote ON quote_documents (quote_id, sort_order);
    `
  },
  {
    name: '0046_assistant_audit',
    // Audit trail for the optional LLM assistant: one row per approved-and-
    // committed batch of creations (customers/invoices). The assistant can only
    // ever create (never delete), and every write is logged here.
    up: `
      CREATE TABLE assistant_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        username TEXT,
        prompt TEXT,
        proposed_actions TEXT NOT NULL,
        result TEXT,
        status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'failed'))
      );
    `
  },
  {
    name: '0047_assistant_conversations',
    // Saved assistant chat history. `turns` is the JSON array of chat turns the
    // UI renders (role/content + any proposal cards), so a reload restores the
    // conversation exactly. Single-user app, so no owner column.
    up: `
      CREATE TABLE assistant_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        turns TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    name: '0048_expense_vat_rate',
    // Optional VAT rate (%) per expense so the tax export can compute input VAT
    // (Vorsteuer). 0 = not specified -> contributes no input VAT.
    up: 'ALTER TABLE expenses ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0'
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
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((r) => (r as { name: string }).name)
  )

  const applied: string[] = []
  for (const migration of migrations) {
    if (done.has(migration.name)) continue

    if (migration.fkOff) {
      // FK toggles only take effect outside a transaction. We disable
      // checks first, run the rebuild atomically inside a transaction, then
      // re-enable + verify with foreign_key_check (throws if the rebuild
      // produced any dangling references).
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          db.exec(migration.up)
          db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name)
        })()
      } finally {
        db.pragma('foreign_keys = ON')
      }
      const violations = db.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new Error(
          `Migration ${migration.name} left foreign key violations: ${JSON.stringify(violations)}`
        )
      }
    } else {
      db.transaction(() => {
        db.exec(migration.up)
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name)
      })()
    }

    applied.push(migration.name)
  }
  return { applied }
}
