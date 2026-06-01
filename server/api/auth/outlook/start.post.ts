// Step 1 of the Outlook OAuth PKCE flow.
//
// The client posts the Azure app credentials (client_id + tenant_id) and a
// human label. We generate a PKCE code_verifier + code_challenge, stash them
// in a short-lived encrypted session, and return the Microsoft authorize URL
// for the browser to redirect to. No client secret is needed (public client
// PKCE flow), so users only have to register an Azure app once and paste in
// the two IDs.

import { randomBytes, createHash } from 'node:crypto'
import { secretIsAvailable } from '~~/server/utils/secrets'

interface Body {
  clientId?: string
  tenantId?: string
  label?: string
}

// Scopes we ask for. offline_access + Mail.Read is the minimum to thread
// inbound replies later. User.Read lets us resolve the connected email
// address right after callback so the Settings list shows it.
const SCOPES = 'offline_access User.Read Mail.Read'

function getBaseUrl(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]): string {
  const headers = getRequestHeaders(event)
  const proto = headers['x-forwarded-proto'] || 'http'
  const host = headers['x-forwarded-host'] || headers.host || 'localhost:3000'
  return `${proto}://${host}`
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  if (!secretIsAvailable()) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CHOHLE_SECRET environment variable must be set before connecting a mailbox'
    })
  }

  const body = await readBody<Body>(event)
  const clientId = (body.clientId ?? '').trim()
  const tenantId = (body.tenantId ?? 'common').trim() || 'common'
  const label = (body.label ?? '').trim()

  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID must be a UUID' })
  }
  if (
    tenantId !== 'common' &&
    tenantId !== 'organizations' &&
    tenantId !== 'consumers' &&
    !/^[0-9a-f-]{36}$/i.test(tenantId)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tenant ID must be common, organizations, consumers, or a UUID'
    })
  }

  // PKCE: random 32 bytes → base64url verifier, SHA-256 → base64url challenge.
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  const redirectUri = `${getBaseUrl(event)}/api/auth/outlook/callback`

  // Stash everything needed by the callback in the session. This survives
  // the round-trip to Microsoft because it's signed + encrypted by
  // nuxt-auth-utils into the session cookie.
  await setUserSession(event, {
    outlookPending: { clientId, tenantId, verifier, state, label, redirectUri }
  })

  const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')

  return { url: url.toString() }
})
