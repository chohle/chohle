// Renders a free-form quote document (TipTap JSON, written in the in-app editor)
// to a branded PDF that gets attached to the quote email. Same pdfkit engine and
// letterhead as the invoice/quote PDFs, so attachments look consistent.
//
// The editor's node set is limited (StarterKit + task lists + text-align +
// images + links — no tables), so we only handle those. renderDocumentPdf is
// pure (JSON + logo bytes in, Buffer out) so it can be unit-tested; the endpoint
// loads the row, sender and logo and calls it.

import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { Database } from 'better-sqlite3'
import PDFDocument from 'pdfkit'
import { emailAssetsDir, readUpload } from './uploads'

const F = {
  reg: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  mono: 'Courier'
}
const LINK = '#3458d6'

export interface TipTapMark {
  type: string
  attrs?: Record<string, unknown>
}
export interface TipTapNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: TipTapMark[]
}

export interface DocSender {
  name: string
  logo?: Buffer | null
}

const PAGE = { margin: 50, width: 595.28, height: 841.89 } // A4 in pt
const CONTENT_W = PAGE.width - PAGE.margin * 2

function hasMark(marks: TipTapMark[] | undefined, type: string): boolean {
  return !!marks?.some((m) => m.type === type)
}
function linkHref(marks: TipTapMark[] | undefined): string | null {
  const m = marks?.find((x) => x.type === 'link')
  const href = m?.attrs?.href
  return typeof href === 'string' ? href : null
}
function fontFor(marks: TipTapMark[] | undefined): string {
  if (hasMark(marks, 'code')) return F.mono
  const b = hasMark(marks, 'bold')
  const i = hasMark(marks, 'italic')
  if (b && i) return F.boldItalic
  if (b) return F.bold
  if (i) return F.italic
  return F.reg
}

// Resolve an editor image src to bytes: data URI, or a hosted email-asset URL
// (/api/email-asset/<name>) that maps to a file on disk. Returns null otherwise.
function loadImage(src: unknown): Buffer | null {
  if (typeof src !== 'string') return null
  try {
    const data = src.match(/^data:image\/[a-z+]+;base64,(.+)$/i)
    if (data) return Buffer.from(data[1], 'base64')
    const m = src.match(/\/api\/email-asset\/([^/?#]+)/)
    if (m) return readFileSync(join(emailAssetsDir(), basename(decodeURIComponent(m[1]))))
  } catch {
    /* unreadable → skip the image rather than fail the PDF */
  }
  return null
}

// Render a run of inline nodes (text with marks, hard breaks) as one flowing
// line, switching font/colour per run via pdfkit's `continued` text.
function renderInline(pdf: PDFKit.PDFDocument, nodes: TipTapNode[], align: string) {
  const runs: TipTapNode[] = []
  for (const n of nodes) {
    if (n.type === 'hardBreak') runs.push({ type: 'text', text: '\n' })
    else if (n.type === 'text' && n.text) runs.push(n)
  }
  if (!runs.length) {
    pdf.text(' ', { align: align as PDFKit.Mixins.TextOptions['align'] })
    return
  }
  runs.forEach((run, i) => {
    const href = linkHref(run.marks)
    pdf
      .font(fontFor(run.marks))
      .fillColor(href ? LINK : '#222222')
      .text(run.text ?? '', {
        continued: i < runs.length - 1,
        align: align as PDFKit.Mixins.TextOptions['align'],
        underline: hasMark(run.marks, 'underline') || !!href,
        strike: hasMark(run.marks, 'strike'),
        link: href ?? undefined
      })
  })
}

function listItemText(item: TipTapNode): TipTapNode[] {
  // A listItem wraps paragraph(s); collect their inline content.
  const para = item.content?.find((c) => c.type === 'paragraph')
  return para?.content ?? []
}

function renderNode(pdf: PDFKit.PDFDocument, node: TipTapNode, indent = 0) {
  const x = PAGE.margin + indent
  const align = (node.attrs?.textAlign as string) || 'left'
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      const size = level === 1 ? 17 : level === 2 ? 14 : 12
      pdf.moveDown(0.4)
      pdf.font(F.bold).fontSize(size).fillColor('#111111')
      renderInline(pdf, node.content ?? [], align)
      pdf.moveDown(0.2)
      break
    }
    case 'paragraph': {
      pdf.font(F.reg).fontSize(11).fillColor('#222222')
      pdf.x = x
      renderInline(pdf, node.content ?? [], align)
      pdf.moveDown(0.5)
      break
    }
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList'
      ;(node.content ?? []).forEach((item, idx) => {
        const prefix = ordered ? `${idx + 1}.` : '•'
        pdf.font(F.reg).fontSize(11).fillColor('#222222')
        pdf.text(prefix, PAGE.margin + indent, pdf.y, { continued: true, width: 18 })
        pdf.text('  ', { continued: true })
        renderInline(pdf, listItemText(item), 'left')
        pdf.moveDown(0.25)
      })
      pdf.moveDown(0.3)
      break
    }
    case 'taskList': {
      ;(node.content ?? []).forEach((item) => {
        const done = item.attrs?.checked ? '[x]' : '[ ]'
        pdf.font(F.mono).fontSize(11).fillColor('#222222')
        pdf.text(done, PAGE.margin + indent, pdf.y, { continued: true })
        pdf.font(F.reg).text('  ', { continued: true })
        renderInline(pdf, listItemText(item), 'left')
        pdf.moveDown(0.25)
      })
      pdf.moveDown(0.3)
      break
    }
    case 'blockquote': {
      const top = pdf.y
      ;(node.content ?? []).forEach((c) => renderNode(pdf, c, indent + 14))
      pdf
        .save()
        .moveTo(PAGE.margin + 2, top)
        .lineTo(PAGE.margin + 2, pdf.y - 6)
        .lineWidth(2)
        .strokeColor('#cccccc')
        .stroke()
        .restore()
      break
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      pdf
        .font(F.mono)
        .fontSize(10)
        .fillColor('#333333')
        .text(text, PAGE.margin + indent, pdf.y, {
          width: CONTENT_W - indent
        })
      pdf.moveDown(0.5)
      break
    }
    case 'horizontalRule': {
      pdf.moveDown(0.3)
      pdf
        .moveTo(PAGE.margin, pdf.y)
        .lineTo(PAGE.width - PAGE.margin, pdf.y)
        .lineWidth(0.5)
        .strokeColor('#e0e0e0')
        .stroke()
      pdf.moveDown(0.6)
      break
    }
    case 'image': {
      const img = loadImage(node.attrs?.src)
      if (!img) break
      const maxW = CONTENT_W
      const maxH = 360
      if (pdf.y + 40 > PAGE.height - PAGE.margin) pdf.addPage()
      try {
        pdf.image(img, PAGE.margin, pdf.y, { fit: [maxW, maxH] })
        // advance past the image (fit keeps aspect; approximate by re-placing y)
        pdf.moveDown(0.5)
      } catch {
        /* unsupported image → skip */
      }
      break
    }
    default: {
      // Unknown container → render its children if any.
      ;(node.content ?? []).forEach((c) => renderNode(pdf, c, indent))
    }
  }
}

export function renderDocumentPdf(opts: {
  title: string
  content: TipTapNode
  sender: DocSender
}): Promise<Buffer> {
  const { title, content, sender } = opts
  const pdf = new PDFDocument({ size: 'A4', margin: PAGE.margin })
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(chunks))))

  // Letterhead: logo top-left, else the sender name (mirrors invoicePdf).
  let drewLogo = false
  if (sender.logo) {
    try {
      pdf.image(sender.logo, PAGE.margin, 50, { fit: [170, 40], valign: 'top' })
      drewLogo = true
    } catch {
      /* fall back to text */
    }
  }
  if (!drewLogo) {
    pdf
      .font(F.bold)
      .fontSize(16)
      .fillColor('#111111')
      .text(sender.name || 'chohle', PAGE.margin, 54)
  }

  pdf.y = 110
  if (title.trim()) {
    pdf.font(F.bold).fontSize(20).fillColor('#111111').text(title, PAGE.margin, pdf.y)
    pdf.moveDown(0.6)
  }

  const body = content?.type === 'doc' ? (content.content ?? []) : []
  for (const node of body) renderNode(pdf, node)

  pdf.end()
  return done
}

// Sanitize a title into a safe PDF filename.
function safeFilename(title: string): string {
  const base = (title || 'Dokument').replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'Dokument'
  return `${base}.pdf`
}

// Load a quote document row + sender/logo and render it. Returns null when the
// document doesn't exist. Shared by the preview endpoint and the email send.
export async function quoteDocumentToPdf(
  db: Database,
  docId: number,
  quoteId?: number
): Promise<{ filename: string; buffer: Buffer } | null> {
  const row = quoteId
    ? (db
        .prepare('SELECT title, content FROM quote_documents WHERE id = ? AND quote_id = ?')
        .get(docId, quoteId) as { title: string; content: string } | undefined)
    : (db.prepare('SELECT title, content FROM quote_documents WHERE id = ?').get(docId) as
        | { title: string; content: string }
        | undefined)
  if (!row) return null

  const sender = db.prepare('SELECT name, logo_path FROM sender WHERE id = 1').get() as
    | { name: string; logo_path: string | null }
    | undefined
  const logo = sender?.logo_path ? await readUpload(sender.logo_path) : null

  let content: TipTapNode
  try {
    content = JSON.parse(row.content) as TipTapNode
  } catch {
    content = { type: 'doc', content: [] }
  }

  const buffer = await renderDocumentPdf({
    title: row.title,
    content,
    sender: { name: sender?.name || 'chohle', logo }
  })
  return { filename: safeFilename(row.title), buffer }
}
