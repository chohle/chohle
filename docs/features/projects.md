# Projects & Pipeline (Vertrieb / Einkauf)

A project is chohle's central engagement entity: it carries a
customer link, a budget, a lifecycle stage, and the documents +
email conversation that hang off it. The same table powers two
kanban boards that run in opposite directions: **Vertrieb** (sales,
money coming in) and **Einkauf** (procurement, money going out).

## Where to find it

- **Sidebar -> Workspace -> Pipeline** holds two items:
  - **Vertrieb** (Sales, route `/sales`, `i-lucide-trending-up`)
  - **Einkauf** (Procurement, route `/procurement`, `i-lucide-shopping-cart`)
- Each route renders the same `PipelineBoard.vue` kanban (sales and
  procurement pages are one-line wrappers passing `direction`). A
  tab strip in the header switches between the two boards.
- The board is a drag-and-drop kanban: columns are stages, cards are
  projects, and the header shows the grand total (sum of all card
  budgets) and project count. Each column shows its own count and
  CHF total.

## Stages per direction

The `projects.direction` column is `'sales'` or `'procurement'`.
Stages are direction-specific and validated server-side; a sales
stage on a procurement project (or vice versa) is rejected
(`server/api/projects/[id].put.ts`, `reorder.post.ts`).

**Sales kanban columns** (`SALES_STAGES`):

```
lead -> contacted -> proposal -> won
```

**Procurement kanban columns** (`PROC_STAGES`):

```
need -> requested -> received -> accepted
```

Sales has two extra lifecycle stages, **`active`** and
**`completed`**, that the server accepts (e.g. a project keeps
running after a deal is won, or it's done) but the kanban GET filters
out — they aren't kanban columns. Migration `0029` also auto-creates
placeholder projects in stage `completed` for legacy invoices.

New cards default to `lead` (sales) or `need` (procurement). A card
carries a name, optional linked customer, inline email/phone (used as
a fallback when no customer is linked), a free-text label, a budget
(`budget_rappen` + `budget_type` of `fixed` / `hourly` / `estimate`),
a due date, and notes.

### Reaching the final column

Dragging a card into the final stage (`won` for sales, `accepted` for
procurement) pops a modal:

- **Sales / won**: offers to create an invoice via
  `POST /api/projects/[id]/invoices` (requires a linked customer;
  otherwise it nudges you to link one), then navigates to the new
  invoice. The invoice is stamped with `project_id`.
- **Procurement / accepted**: offers to log an expense
  (`POST /api/expenses`) for the budget amount against the vendor.

Either action can be skipped; the card just stays in the column.

## How projects connect to documents & email

A project is the hub that ties a customer's deal to its paperwork and
correspondence:

- **Invoices** — `invoices.project_id` (migration `0027`) and made
  **NOT NULL** by `0029`: every invoice belongs to a project. The
  detail view lists a project's invoices with computed totals
  (`GET /api/projects/[id]/invoices`) so you can see budget burn vs
  the project budget. A project with invoices can't be deleted
  (`ON DELETE RESTRICT` -> 409). See [Invoices](invoices.md).
- **Quotes** — `POST /api/projects/[id]/quotes` spins up a draft
  quote (customer + title prefilled, valid 30 days) linked back via
  `quotes.project_id`. See [Quotes](quotes.md).
- **Email** — each project has its own conversation thread in
  `project_emails`. `POST /api/projects/[id]/emails` sends a branded
  email through SMTP (outbound) and `.../emails/log` records a reply
  the user pasted in by hand (inbound). `GET .../emails` returns the
  thread oldest-first. See [Email](email.md).

When a customer is linked, the project resolves the customer's
email/phone on read (`COALESCE(c.email, p.email)`); otherwise it uses
the inline contact fields, so a lead can live on the board before any
customer record exists.

## Backed by

- **Migrations** (`server/utils/migrate.ts`):
  - `0022_deals` — original sales kanban (`deals`, stages
    lead/contacted/proposal/won).
  - `0023_deals_direction` — adds the `direction` column and the
    procurement stages (need/requested/received/accepted).
  - `0024_deal_emails` — per-deal email thread.
  - `0025_deals_contact` — inline `email` / `phone` on a card.
  - `0026_rename_deals_to_projects` — renames `deals` -> `projects`,
    `value_rappen` -> `budget_rappen`, adds `budget_type`.
  - `0027_invoices_project_id` / `0029_invoices_require_project` —
    link invoices to projects, then make it mandatory.
  - `0028_projects_active_completed_stages` — drops the stage CHECK
    and adds the `active` / `completed` sales lifecycle stages
    (validated in the API instead).
- **Endpoints** (`server/api/projects/`):
  - `index.get.ts` (board by direction), `index.post.ts` (create),
    `[id].get.ts` / `[id].put.ts` / `[id].delete.ts`,
    `reorder.post.ts` (drag persistence).
  - `[id]/invoices.{get,post}.ts`, `[id]/quotes.post.ts`,
    `[id]/emails/{index.get,index.post,log.post}.ts`.
- **UI**: `app/components/PipelineBoard.vue` (kanban + create/edit
  slideover + final-stage modal), `app/pages/sales/index.vue` &
  `app/pages/procurement/index.vue` (board wrappers),
  `app/pages/sales/[id].vue` & `app/pages/procurement/[id].vue`
  (detail, via `ProjectDetailView`).
- **Tests**: there's no standalone projects suite; `test/quotes.test.ts`
  seeds the `projects` table and asserts the invoice/quote
  conversion's "must have a project" rule (migration `0029`).
