# Articles (reusable line items)

Articles are saved line items you reuse across invoices and quotes:
pick one from a dropdown and its description, unit, price, and VAT
rate prefill the row. They come in two flavours: a shared global
library, and per-customer articles scoped to a single
[customer](customers.md).

## Where to find it

- **Sidebar -> Workspace -> Articles** (route `/articles`, package
  icon `i-lucide-package`) opens the global library: a table of
  name / unit / price / VAT with edit + delete per row.
- **New article** (top right) opens a slideover form. The same
  `ArticleManager` component is reused inside the customer-detail page
  (in `headless` mode) to manage that customer's own articles.

## What an article holds

The `articles` table (`server/utils/migrate.ts`, migration
`0010_articles`) stores:

| Column                 | Meaning                                           |
| ---------------------- | ------------------------------------------------- |
| `name`                 | what shows in the picker and prefills description |
| `unit`                 | free text, e.g. `h`, `Std.`, `Stk.` (may be `''`) |
| `default_price_rappen` | default unit price in Rappen (CHF × 100)          |
| `default_mwst`         | default VAT %, defaults to `8.1` (Swiss standard) |
| `customer_id`          | NULL = global, set = belongs to that customer     |

The UI works in CHF; `parseArticle` (`server/utils/article.ts`)
converts the entered `price` to Rappen via `Math.round(price * 100)`
and rejects negative or non-finite price/`mwst`. In the form, a
"charge MWST" switch toggles `mwst` between `0` and `8.1`; if the
sender isn't VAT-registered new articles default to `0`.

## Global vs per-customer articles

`customer_id` decides the scope:

- **Global** (`customer_id IS NULL`) — the shared library shown on
  `/articles`. Served and created by
  `GET`/`POST /api/articles/index.{get,post}.ts`, which filter on
  `customer_id IS NULL` and insert with no `customer_id`.
- **Per-customer** (`customer_id` set) — articles that only make
  sense for one customer (a negotiated rate, a bespoke service).
  Served and created by
  `server/api/customers/[id]/articles.{get,post}.ts`, which 404 if
  the customer doesn't exist and insert with that `customer_id`. They
  cascade-delete with the customer (`ON DELETE CASCADE`).

This per-customer dimension was added by migration
`0014_articles_customer_id`; it replaced the old `customer_rates`
table (a separate per-customer price-override concept), which was
dropped in `0015_drop_customer_rates`. Edit (`PUT`) and delete
(`DELETE`) go through `/api/articles/[id]` for both flavours.

## How they become line items

Both the invoice editor (`app/pages/invoices/[id]/index.vue`) and the
quote editor (`app/pages/quotes/[id].vue`) fetch **both** lists and
merge them:

```ts
const { data: globalArticles }   = useFetch('/api/articles')
const { data: customerArticles } = useFetch(`/api/customers/${customerId}/articles`)
const articles = computed(() => [...globalArticles.value, ...customerArticles.value])
```

Picking an article fills the row from its defaults:

- `description` ← `name`
- `unit` ← `unit`
- `unitPrice` ← `default_price_rappen / 100`
- `mwstPercent` ← `default_mwst`

These are copied as plain values, so editing the row afterwards never
touches the article, and changing the article later never rewrites
existing documents. The line stores its own
`article_id` (a nullable `REFERENCES articles(id) ON DELETE SET
NULL`), `unit_price_rappen`, and `mwst_percent`. The quote editor is
slightly gentler: it only overwrites price/VAT if the row is still at
its defaults, so a manual tweak survives re-selecting.

See [Invoices](invoices.md) and [Quotes](quotes.md) for how those
line items are then totalled and rendered.

## Backed by

- Migrations in `server/utils/migrate.ts`: `0010_articles` (table),
  `0014_articles_customer_id` (per-customer column),
  `0015_drop_customer_rates` (removes the superseded override table).
- Endpoints: `server/api/articles/index.get.ts`,
  `index.post.ts`, `[id].put.ts`, `[id].delete.ts`; and per-customer
  `server/api/customers/[id]/articles.get.ts` + `.post.ts`. Shared
  validation in `server/utils/article.ts`.
- UI: `app/pages/articles.vue` + the reusable
  `app/components/ArticleManager.vue`.
- The assistant can create articles too: `test/assistantCommit.test.ts`
  covers the `create_article` action (CHF -> Rappen conversion).
