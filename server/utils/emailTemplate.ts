// One branded email shell for every outbound message — invoice/quote sends,
// payment reminders, and project replies all wrap their body in renderEmail()
// so the look is identical everywhere. Table-based layout with inline styles,
// the only thing email clients render reliably. The logo is referenced by
// absolute URL (served public + cache-busted) so nothing rides along as an
// attachment; without a configured base URL or logo it falls back to a text
// wordmark. Keep this the single source of truth: restyle here, every email
// updates.

import { readUpload } from './uploads'

export interface EmailSender {
  name: string
  email?: string | null
  phone?: string | null
  website?: string | null
  mwst?: string | null
  logo_path?: string | null
}

const FONT = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Shared plaintext fallback for the text/plain part. Strips block tags to
// newlines and unescapes the common entities; good enough for clients that
// don't render the HTML part.
export function htmlToText(html: string): string {
  let text = html.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  // Strip remaining tags, looping until stable so overlapping brackets like
  // "<scr<script>ipt>" can't reveal a fresh tag after a single pass.
  let prev: string
  do {
    prev = text
    text = text.replace(/<[^>]+>/g, '')
  } while (text !== prev)
  return (
    text
      .replace(/&nbsp;/g, ' ')
      .replace(/&middot;/g, '·')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      // Unescape &amp; last so e.g. "&amp;lt;" decodes to the literal "&lt;",
      // not "<" (avoids double-unescaping; CodeQL js/double-escaping).
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

// Absolute URL of the sender logo, or null when no base URL / no logo is set.
export function logoUrlFor(logoPath: string | null | undefined): string | null {
  const base = (useRuntimeConfig().siteUrl as string) || ''
  if (!base || !logoPath) return null
  return `${base.replace(/\/+$/, '')}/api/sender/logo?v=${encodeURIComponent(logoPath)}`
}

// Logo box: the displayed logo is scaled to fit within this, never cropped.
const LOGO_MAX_W = 300
const LOGO_MAX_H = 52

// Read a PNG's intrinsic pixel size from its IHDR chunk (uploads are enforced
// PNG). Null if it doesn't look like a PNG.
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

// Scale (w,h) down to fit within (maxW,maxH), preserving aspect; never upscale.
function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

// The body is user-authored (rich-text editor) and can contain images pasted as
// data URIs. Force every body image inline-responsive so a full-size paste
// can't overflow the card — the <style> block below covers clients that keep
// it, this covers the ones (e.g. Gmail) that strip <style>.
function styleBodyImages(html: string): string {
  const fit = 'max-width:100%;height:auto'
  return html.replace(/<img\b([^>]*?)\s*\/?>/gi, (_full, attrs: string) => {
    if (/\bstyle\s*=/i.test(attrs)) {
      return `<img${attrs.replace(/\bstyle\s*=\s*(["'])(.*?)\1/i, (_m, q, s) => `style=${q}${s};${fit}${q}`)} />`
    }
    return `<img${attrs} style="${fit}" />`
  })
}

// Resolve the hosted logo + the size it should render at (capped to the box, so
// a huge upload can't blow out the layout). Null when no base URL / no logo.
export async function logoInfoFor(
  logoPath: string | null | undefined
): Promise<{ url: string; width: number; height: number } | null> {
  const url = logoUrlFor(logoPath)
  if (!url) return null
  const buf = await readUpload(logoPath)
  const size = buf ? pngSize(buf) : null
  // Fall back to a sane wordmark-ish ratio when dimensions can't be read.
  const { width, height } = size
    ? fitWithin(size.w, size.h, LOGO_MAX_W, LOGO_MAX_H)
    : { width: 160, height: 40 }
  return { url, width, height }
}

export interface RenderOpts {
  // Hosted logo + capped render size. Pass null to force the text-wordmark header.
  logo?: { url: string; width: number; height: number } | null
  // Optional sign-off block inserted after the body (the signatures feature).
  signatureHtml?: string
  // Optional call-to-action button.
  cta?: { label: string; url: string }
}

// Wrap body HTML in the shared branded shell (dark header band + logo, body,
// optional CTA + signature, contact footer).
export function renderEmail(sender: EmailSender, bodyHtml: string, opts: RenderOpts = {}): string {
  const name = escapeHtml(sender.name || 'chohle')
  const footer = [sender.phone, sender.email, sender.website, sender.mwst]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;')

  // The logo is a dark wordmark, so on the dark band it sits inside a white
  // chip; with no logo we render the name as a light wordmark instead. Explicit
  // width/height (capped in logoInfoFor) keep even Outlook from blowing it up.
  const header = opts.logo
    ? `<span style="display:inline-block;background:#ffffff;border-radius:10px;padding:13px 22px;line-height:0">
         <img src="${opts.logo.url}" alt="${name}" width="${opts.logo.width}" height="${opts.logo.height}" style="display:block;border:0;outline:none;text-decoration:none;width:${opts.logo.width}px;height:${opts.logo.height}px;max-width:100%" />
       </span>`
    : `<div style="${FONT};font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff">${name}</div>`

  const cta = opts.cta
    ? `<tr><td style="padding:8px 40px 4px">
         <table role="presentation" cellpadding="0" cellspacing="0"><tr>
           <td style="border-radius:9px;background:#0f0f0f">
             <a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:13px 26px;${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px">${escapeHtml(opts.cta.label)}</a>
           </td>
         </tr></table>
       </td></tr>`
    : ''

  const signature = opts.signatureHtml
    ? `<tr><td style="padding:18px 40px 0;${FONT};font-size:14px;line-height:1.6;color:#444444">${opts.signatureHtml}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<style>
  img { max-width: 100%; height: auto; }
  a { color: #0f0f0f; }
  p { margin: 0 0 14px; }
  p:last-child { margin-bottom: 0; }
  ul, ol { margin: 0 0 14px; padding-left: 22px; }
  blockquote { margin: 0 0 14px; padding-left: 14px; border-left: 3px solid #e5e5e5; color: #555; }
</style>
</head>
<body style="margin:0;padding:0;background:#eef0f2;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f2">
  <tr>
    <td align="center" style="padding:32px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e6e6e9;border-radius:16px;overflow:hidden">
        <tr><td align="center" style="background:#0f0f0f;padding:30px 36px">${header}</td></tr>
        <tr><td style="padding:34px 40px 6px;${FONT};font-size:15px;line-height:1.65;color:#2b2b2b">${styleBodyImages(bodyHtml)}</td></tr>
        ${cta}
        ${signature}
        <tr><td style="padding:26px 40px 0"><div style="border-top:1px solid #eeeeee;font-size:0;line-height:0">&nbsp;</div></td></tr>
        ${
          footer
            ? `<tr><td align="center" style="padding:18px 40px 30px;${FONT};font-size:12px;line-height:1.7;color:#9a9a9a">${footer}</td></tr>`
            : `<tr><td style="height:14px"></td></tr>`
        }
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

// Build the branded HTML + plaintext for a send. Logo is hosted (no
// attachments), so callers attach only their own documents (e.g. the PDF).
export async function buildBrandedEmail(
  sender: EmailSender,
  bodyHtml: string,
  opts: Omit<RenderOpts, 'logo'> = {}
): Promise<{ html: string; text: string }> {
  const logo = await logoInfoFor(sender.logo_path)
  const html = renderEmail(sender, bodyHtml, { ...opts, logo })
  return { html, text: htmlToText(bodyHtml) }
}
