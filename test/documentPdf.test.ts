import { describe, it, expect } from 'vitest'
import { renderDocumentPdf, type TipTapNode } from '../server/utils/documentPdf'

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
