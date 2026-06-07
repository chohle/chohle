import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../server/utils/migrate'
import {
  renderDocumentPdf,
  quoteDocumentAttachment,
  safeHref,
  type TipTapNode
} from '../server/utils/documentPdf'

function makeDb() {
  const db = new Database(':memory:')
  runMigrations(db)
  // This unit targets the attachment resolver, not referential integrity, so
  // we insert documents against bare quote ids without seeding quotes/customers.
  db.pragma('foreign_keys = OFF')
  db.prepare('INSERT OR IGNORE INTO sender (id) VALUES (1)').run()
  return db
}

const sampleDoc: TipTapNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Proposal' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello, here is our ' },
        { type: 'text', text: 'detailed', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' offer.' }
      ]
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Design' }] }]
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Development' }] }]
        }
      ]
    },
    { type: 'horizontalRule' },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See ', marks: [] },
        {
          type: 'text',
          text: 'our site',
          marks: [{ type: 'link', attrs: { href: 'https://x.ch' } }]
        }
      ]
    }
  ]
}

describe('document pdf', () => {
  it('renders a TipTap document to a valid PDF buffer', async () => {
    const buf = await renderDocumentPdf({
      title: 'Offerte Beilage',
      content: sampleDoc,
      sender: { name: 'chohle GmbH', logo: null }
    })
    expect(buf.length).toBeGreaterThan(800)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('handles an empty document without throwing', async () => {
    const buf = await renderDocumentPdf({
      title: '',
      content: { type: 'doc', content: [] },
      sender: { name: 'chohle', logo: null }
    })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('safeHref', () => {
  it('keeps http(s) and mailto, drops everything else', () => {
    expect(safeHref('https://x.ch')).toBe('https://x.ch')
    expect(safeHref('http://x.ch')).toBe('http://x.ch')
    expect(safeHref('mailto:a@b.ch')).toBe('mailto:a@b.ch')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>')).toBeNull()
    expect(safeHref(42)).toBeNull()
  })
})

describe('quoteDocumentAttachment', () => {
  it('resolves an editor doc to a PDF only for its own quote', async () => {
    const db = makeDb()
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo' }] }]
    })
    const docId = Number(
      db
        .prepare("INSERT INTO quote_documents (quote_id, title, content) VALUES (7, 'Beilage', ?)")
        .run(content).lastInsertRowid
    )

    const ok = await quoteDocumentAttachment(db, docId, 7)
    expect(ok).not.toBeNull()
    expect(ok!.contentType).toBe('application/pdf')
    expect(ok!.content.subarray(0, 5).toString()).toBe('%PDF-')

    // Scoped to the wrong quote → not found (no cross-quote leakage).
    expect(await quoteDocumentAttachment(db, docId, 999)).toBeNull()
    // Unscoped (no quote id) still resolves by doc id.
    expect(await quoteDocumentAttachment(db, docId)).not.toBeNull()
  })

  it('enforces the attach/kind CHECK constraints (migration 0045)', () => {
    const db = makeDb()
    expect(() =>
      db.prepare('INSERT INTO quote_documents (quote_id, attach) VALUES (1, 5)').run()
    ).toThrow()
    expect(() =>
      db.prepare("INSERT INTO quote_documents (quote_id, kind) VALUES (1, 'bogus')").run()
    ).toThrow()
  })
})
