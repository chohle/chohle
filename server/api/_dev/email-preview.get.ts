// Dev-only: render the shared branded email shell (server/utils/emailTemplate.ts)
// with a sample body so you can eyeball the template in a browser at
// /api/_dev/email-preview. 404s in production. The cid:logo reference can't
// resolve in a browser, so it's pointed at the served logo URL here.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

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

  const body =
    `<p>Guten Tag Emanuell Ademi</p>` +
    `<p>anbei erhalten Sie die Rechnung <strong>50192</strong>, zahlbar bis 03.07.2026.</p>` +
    `<p>Besten Dank für Ihr Vertrauen und die gute Zusammenarbeit.</p>` +
    `<p>Freundliche Grüsse<br>${sender.name}</p>`

  // Renders exactly what an email would: the logo is loaded from its public
  // URL (set NUXT_SITE_URL=http://localhost:3000 in dev so it resolves) and
  // scaled to fit the logo box.
  const html = renderEmail(sender, body, { logo: await logoInfoFor(sender.logo_path) })

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return html
})
