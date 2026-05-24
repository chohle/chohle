# Vision: what I'm trying to achieve

## The goal

One clean, self-owned place to manage **all the money** of a one-person Swiss business,
from "I bought something" to "I sent the invoice and got paid." No spreadsheets scattered
around, no paying monthly for heavy accounting suites I use 10 % of, and no handing my
financial data to someone else's cloud.

Batze should answer, at a glance:

- **What did I spend, and on what?** (with the receipt attached)
- **When does my money actually arrive?** (salary and recurring clients, adjusted for Swiss
  weekends and cantonal holidays)
- **Who are my customers, and what do I charge them?**
- **What do I still need to invoice, and is it paid?**

## Who it's for

**One person.** A freelancer or a one-person GmbH, like a web developer running their own
shop. It is deliberately **single-user** by design: one owner, full access, private data.
There is no team or company mode, and that's on purpose. The whole point is that all of
your spending and income stays yours and yours alone.

## Guiding principles

1. **Swiss-first.** CHF, MWST (currently 8.1 %), 5-Rappen rounding, cantonal public
   holidays, and the QR-Rechnung are first-class, not afterthoughts.
2. **Self-hosted and private.** Runs on your own server. Everything lives in a local
   `data/` folder (database plus uploaded files). Back up that folder and you've backed up
   everything.
3. **Own your data.** Plain SQLite. No lock-in, no external accounts required to run it.
4. **Lean, not a full ERP.** Borrow the *good* ideas from Swiss accounting tools (reusable
   articles, QR-bill, MWST) but skip the bloat (catalogs with SEO, barcodes, article sets,
   FIBU tags, and so on). Only what a solo business actually uses.
5. **Clean and fast.** A modern, uncluttered UI. Do the boring math (VAT, rounding, pay
   dates) automatically and correctly.

## The "from spend to paid" loop

```
   EXPENSES                  INCOME                    CUSTOMERS AND INVOICES

   buy something             define salary/clients     keep a customer book
   attach receipt            auto-calc the pay date     add reusable articles
   categorize                (skip weekends and          (title, price, options)
       |                      CH holidays)              build an invoice
       |                          |                      MWST + 5-Rappen rounding
       |                          |                      PDF + Swiss QR-bill
       |                          |                          |
       +------------+-------------+                          |
                    v                                        v
              DASHBOARD                                send and get paid
       income vs expenses, net,
       trend, what's outstanding
```

## What "done" looks like (long-term)

A solo Swiss professional can run their whole money life in Batze: log expenses, see the
month at a glance, track when salary and clients pay, and generate compliant Swiss invoices
(with QR-bill), eventually one-click PDF and email, all self-hosted and private.