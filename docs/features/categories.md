# Categories

Categories are labels you attach to expenses (and a parallel income
list) so the [Expenses](expenses.md) page can filter and chart them and
the [Tax export](tax-export.md) can break expenses down by category in
the Erfolgsrechnung. chohle ships with no defaults; the list starts
empty until you add your own.

## Where to find it

**Sidebar -> Finance -> Categories** (route `/categories`, the
`i-lucide-tags` icon) opens a single card split into two columns,
**Expenses** and **Income**, fed from `GET /api/categories` and
filtered client-side by `type`. **Add category** in the top right opens
a slideover form.

## What a category holds

Each row in the `categories` table carries:

- **id** — autoincrement primary key.
- **name** — free text, required (trimmed; empty is rejected).
- **type** — `'expense'` or `'income'`, enforced by a CHECK constraint
  and by `parseCategory`. The two types are just two lists; expenses
  only ever reference expense-type categories in the editor.
- **color** — a stored `TEXT NOT NULL`, but no longer user-editable.
  The page writes a constant ink value (`#0A0A0A`) so existing rows
  stay valid; the column survives for back-compat.
- **icon** — a Lucide icon name picked from a fixed grid of ~18 options
  (`i-lucide-shopping-cart`, `i-lucide-car`, `i-lucide-home`, ...).
- **created_at** — `datetime('now')` default.

## How categories are used

**Expense filtering.** `GET /api/expenses` left-joins `categories` and
returns `category_id` plus `category_name`, `category_color`,
`category_icon` per expense. The expenses page renders an icon+name
chip per row, a clickable chip bar that toggles an `activeCategories`
set to filter the table, and a "by category" donut/KPI summarising
totals per category (uncategorised expenses, `category_id == null`, are
skipped in the donut).

**Tax-export category breakdown.** `buildTaxReport`
(`server/utils/taxReport.ts`) left-joins `categories` and groups gross
expense totals by category name into `expenses.byCategory`, sorted
descending by total. Expenses with no category fall under the literal
key **`Uncategorized`**. This array is surfaced by
`GET /api/tax-export/summary` and the report PDF.

## Create / edit / delete

- **Create** — `POST /api/categories` runs `parseCategory`, which
  requires a non-empty name, a valid `type`, plus color and icon, then
  inserts and returns the new id.
- **Edit** — `PUT /api/categories/:id` re-validates and updates
  name/type/color/icon; a missing id returns 404.
- **Delete** — `DELETE /api/categories/:id` removes the row. It does
  **not** delete the expenses pointing at it: the `expenses.category_id`
  foreign key is declared `ON DELETE SET NULL`, so affected expenses
  simply become uncategorised (and then group under `Uncategorized` in
  the tax export). The page asks for confirmation first via
  `useConfirm()`.

All four endpoints call `requireUserSession`.

## Backed by

- Migration `0002_categories` creates the `categories` table;
  `0003_expenses` adds `category_id INTEGER REFERENCES categories(id)
  ON DELETE SET NULL`.
- Endpoints: `server/api/categories/index.get.ts`,
  `index.post.ts`, `[id].put.ts`, `[id].delete.ts`; validation in
  `server/utils/category.ts` (`parseCategory`).
- UI: `app/pages/categories.vue`; consumed by
  `app/pages/expenses.vue`.
- `test/taxReport.test.ts` asserts the `byCategory` rollup (e.g.
  `[{ name: 'Büro', totalRappen: 15810 }]`). No dedicated
  categories-endpoint test exists.
