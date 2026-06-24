# Tax export

A year-end package for your Swiss tax return / your Treuhänder, built on the
principle "keine Buchung ohne Beleg" (no booking without a receipt). Open
**Finance → Steuerexport (Tax export)**, pick a year, and download one ZIP.

## What's in the ZIP

```text
Steuerexport-<year>.pdf     Erfolgsrechnung (income vs expenses), MWST summary,
                            expense journal, and a "missing receipts" list.
buchungen-<year>.csv        The journal (expenses + income) for the Treuhänder.
                            ';'-separated + UTF-8 BOM, opens cleanly in Excel.
belege/0001_<vendor>_<date>.<ext>   Every receipt, numbered to the journal rows.
```

The report is rendered in **German** (the language of Swiss tax filings).

## Income vs expenses (cash basis)

- **Income** = paid invoices (by `paid_at`) + salary payments (`income_payments`).
- **Expenses** = everything booked under Expenses (by `date`), grouped by category.
- **Net** = income − expenses.

All amounts are **gross (incl. MWST)**.

## VAT / MWST

The MWST summary appears only when you're **VAT-registered** (Settings →
`vat_registered`):

- **Output VAT (Umsatzsteuer)** is recomputed from each paid invoice's line items.
- **Input VAT (Vorsteuer)** comes from the optional **VAT %** you set per expense
  (Expenses form). Expenses left at 0 % contribute no input VAT, but their
  receipts are still in the bundle, so the Treuhänder can reconcile Vorsteuer from
  them.

## Receipts

Attach receipts on each expense (Expenses page). The export flags any expense
without one, both in the page and in the report, so nothing slips through before
you hand it over. Keep the bundle: Swiss law (OR Art. 958f) requires retaining
business records and receipts for **10 years**.

## Internals

| File                                   | Role                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `server/utils/taxReport.ts`            | `buildTaxReport(db, year)`: gathers the year's data. |
| `server/utils/taxReportPdf.ts`         | Renders the Erfolgsrechnung PDF (pdfkit).             |
| `server/utils/taxExportZip.ts`         | Bundles PDF + CSV + receipts (fflate).                |
| `server/api/tax-export/summary.get.ts` | JSON preview for the page.                            |
| `server/api/tax-export/[year].get.ts`  | Streams the ZIP.                                      |
| `app/pages/tax-export.vue`             | The page.                                             |

Migration `0048` adds the optional `expenses.vat_rate` column.
