// Render the EBICS initialization (INI) letter as printable HTML. The user
// prints it, signs it by hand, and mails/uploads it to the bank to activate the
// subscriber. Holds the SHA-256 hashes of the three generated public keys.
//
// Served as HTML for the browser to print (window.print on the banking page).

import { decryptSecret } from '~~/server/utils/secrets'
import { getConnection } from '~~/server/utils/bankSync'
import { buildIniLetter, type EbicsKeys, type EbicsVersion } from '~~/server/utils/ebics'

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const conn = getConnection(useDb())
  if (!conn || conn.provider !== 'ebics') {
    throw createError({ statusCode: 404, statusMessage: 'No EBICS connection' })
  }

  let cfg: {
    version?: EbicsVersion
    hostId?: string
    partnerId?: string
    userId?: string
    keys?: EbicsKeys
  }
  try {
    cfg = JSON.parse(decryptSecret(conn.config))
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Connection config unreadable' })
  }
  if (!cfg.keys?.signature?.publicKey) {
    throw createError({ statusCode: 409, statusMessage: 'No keys generated yet' })
  }

  const letter = buildIniLetter(
    {
      version: cfg.version ?? 'H005',
      hostId: cfg.hostId ?? '',
      partnerId: cfg.partnerId ?? '',
      userId: cfg.userId ?? ''
    },
    cfg.keys
  )

  const rows = letter.keys
    .map(
      (k) => `
      <div class="key">
        <div class="key-head">${esc(k.ebicsName)} — ${esc(k.purpose)} key · SHA-256</div>
        <div class="hash">${esc(k.hash)}</div>
      </div>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>EBICS INI letter</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color:#111; max-width: 720px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color:#666; font-size: 13px; margin-bottom: 24px; }
  table { border-collapse: collapse; font-size: 14px; margin: 16px 0 24px; }
  td { padding: 3px 18px 3px 0; }
  td.l { color:#666; }
  .key { margin: 14px 0; }
  .key-head { font-size: 12px; color:#666; text-transform: uppercase; letter-spacing:.04em; }
  .hash { font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.7; word-break: break-all; border:1px solid #e5e5e5; border-radius:8px; padding:10px 12px; margin-top:4px; }
  .sign { margin-top: 40px; font-size: 14px; }
  .line { margin-top: 36px; border-top: 1px solid #111; width: 280px; padding-top: 4px; color:#666; font-size: 12px; }
  @media print { body { margin: 0 auto; } }
</style></head>
<body>
  <h1>EBICS Initialization Letter (INI)</h1>
  <div class="sub">Print, sign, and send to your bank to activate this EBICS subscriber.</div>
  <table>
    <tr><td class="l">EBICS version</td><td>${esc(letter.version)}</td></tr>
    <tr><td class="l">Host ID</td><td>${esc(letter.hostId)}</td></tr>
    <tr><td class="l">Partner ID</td><td>${esc(letter.partnerId)}</td></tr>
    <tr><td class="l">User ID</td><td>${esc(letter.userId)}</td></tr>
    <tr><td class="l">Date</td><td>${esc(letter.date)}</td></tr>
  </table>
  ${rows}
  <div class="sign">I confirm the public-key hashes above belong to my EBICS subscriber.</div>
  <div class="line">Place, date — Signature</div>
</body></html>`

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return html
})
