// Authenticated email preview, used in two places:
//  - Settings signature editor: pass { signature_html } (the unsaved content) —
//    rendered in the signature slot over a neutral placeholder body.
//  - Send flows (project / invoice / quote): pass { body_html, signature_id } —
//    renders exactly what will be sent (real message + chosen signature).
// Returned as HTML for an <iframe srcdoc>.
interface Body {
  body_html?: string
  signature_id?: number
  signature_html?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { body_html, signature_id, signature_html } = await readBody<Body>(event)

  const db = useDb()
  const sender = (db
    .prepare('SELECT name, email, phone, website, mwst, logo_path FROM sender WHERE id = 1')
    .get() as {
    name: string
    email: string | null
    phone: string | null
    website: string | null
    mwst: string | null
    logo_path: string | null
  } | null) ?? {
    name: 'chohle',
    email: null,
    phone: null,
    website: null,
    mwst: null,
    logo_path: null
  }

  // Resolve the signature: explicit html (live editing) wins, else by id.
  let signatureHtml = signature_html?.trim() || undefined
  if (!signatureHtml && Number.isInteger(Number(signature_id))) {
    const sig = db
      .prepare(`SELECT content_html FROM signatures WHERE id = ?`)
      .get(Number(signature_id)) as { content_html: string } | undefined
    signatureHtml = sig?.content_html || undefined
  }

  // Real message when given; otherwise a neutral, language-agnostic placeholder
  // (faint bars) so a signature can be previewed without inventing prose.
  const bar = (w: string) =>
    `<div style="height:11px;background:#ededed;border-radius:5px;margin:0 0 11px;width:${w}"></div>`
  const body = body_html?.trim() || `${bar('45%')}${bar('92%')}${bar('88%')}${bar('60%')}`

  const html = renderEmail(sender, body, {
    logo: await logoInfoFor(sender.logo_path),
    signatureHtml
  })
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return html
})
