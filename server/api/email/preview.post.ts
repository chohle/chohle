// Authenticated email preview for the Settings signature editor: renders the
// branded shell with a sample body and the given signature HTML in its slot, so
// the user sees exactly how a sent email looks — live, as they edit. Returned as
// HTML for an <iframe srcdoc>.
interface Body {
  content_html?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { content_html } = await readBody<Body>(event)

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
  } | null) ?? { name: 'chohle', email: null, phone: null, website: null, mwst: null, logo_path: null }

  // No invented sample text — the message area is a neutral, language-agnostic
  // placeholder (faint bars) so the focus is the signature, not made-up prose.
  const bar = (w: string) =>
    `<div style="height:11px;background:#ededed;border-radius:5px;margin:0 0 11px;width:${w}"></div>`
  const body = `${bar('45%')}${bar('92%')}${bar('88%')}${bar('60%')}`

  const html = renderEmail(sender, body, {
    logo: await logoInfoFor(sender.logo_path),
    signatureHtml: content_html?.trim() || undefined
  })
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return html
})
