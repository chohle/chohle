// Quote conversion logic, factored out so the convert-to-invoice
// endpoint and the vitest suite share one implementation. Keeping the
// endpoint a thin shell over this helper makes the conversion rules
// (already-converted / declined / no-project) easy to assert without
// having to spin up Nitro.

import type { Database } from 'better-sqlite3'

export class QuoteConvertError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'QuoteConvertError'
  }
}

export interface ConvertResult {
  invoiceId: number
}

// Convert a quote into a draft invoice. Validates state, copies the
// quote header (customer + project + title) onto a new invoices row,
// copies every line item with position preserved, stamps
// converted_invoice_id + accepted_at on the quote so it can't be
// converted twice. All inside one db.transaction() so a partial
// failure rolls back. Returns the new invoice id.
export function convertQuoteToInvoice(db: Database, quoteId: number): ConvertResult {
  const quote = db
    .prepare(
      `SELECT id, customer_id, project_id, title, status, converted_invoice_id
       FROM quotes WHERE id = ?`
    )
    .get(quoteId) as
    | {
        id: number
        customer_id: number
        project_id: number | null
        title: string
        status: string
        converted_invoice_id: number | null
      }
    | undefined
  if (!quote) throw new QuoteConvertError(404, 'Quote not found')
  if (quote.converted_invoice_id) {
    throw new QuoteConvertError(
      409,
      `Quote already converted to invoice ${quote.converted_invoice_id}`
    )
  }
  if (quote.status === 'declined') {
    throw new QuoteConvertError(422, 'Cannot convert a declined quote')
  }
  if (!quote.project_id) {
    throw new QuoteConvertError(
      422,
      'Link the quote to a project before converting; invoices require a project'
    )
  }

  const customer = db
    .prepare('SELECT payment_term_days FROM customers WHERE id = ?')
    .get(quote.customer_id) as { payment_term_days: number } | undefined
  if (!customer) throw new QuoteConvertError(404, 'Customer not found')

  const issue = new Date().toISOString().slice(0, 10)
  const due = new Date(Date.now() + customer.payment_term_days * 86_400_000)
    .toISOString()
    .slice(0, 10)

  let invoiceId = 0
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO invoices (customer_id, project_id, number, title, issue_date, due_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(quote.customer_id, quote.project_id, '', quote.title, issue, due)
    invoiceId = Number(r.lastInsertRowid)

    db.prepare(
      `INSERT INTO invoice_items
         (invoice_id, article_id, description, quantity, unit, unit_price_rappen,
          discount_percent, mwst_percent, position)
       SELECT ?, article_id, description, quantity, unit, unit_price_rappen,
              discount_percent, mwst_percent, position
       FROM quote_items WHERE quote_id = ? ORDER BY position, id`
    ).run(invoiceId, quoteId)

    db.prepare(
      `UPDATE quotes
       SET converted_invoice_id = ?,
           status = CASE WHEN status = 'accepted' THEN status ELSE 'accepted' END,
           accepted_at = COALESCE(accepted_at, ?)
       WHERE id = ?`
    ).run(invoiceId, issue, quoteId)
  })()

  return { invoiceId }
}
