// Step 1 of the Gmail OAuth PKCE flow.
//
// The client posts the Google OAuth client_id + client_secret + label.
// We generate a PKCE code_verifier + code_challenge, stash everything
// in a short-lived encrypted session, and return the Google authorize
// URL for the browser to redirect to. Unlike Microsoft, Google's Web
// OAuth client requires a client_secret on the token exchange (even
// with PKCE), so the user must paste it here as well as the client ID.

import { randomBytes, createHash } from 'node:crypto'
import { secretIsAvailable } from '~~/server/utils/secrets'

interface Body {
  clientId?: string
  clientSecret?: string
  label?: string
}

// Read for inbound replies, profile + email so we can resolve the
// connected address right after callback.
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly openid email profile'

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
      statusMessage: 'BATZE_SECRET environment variable must be set before connecting a mailbox'
    })
  }

  const body = await readBody<Body>(event)
  const clientId = (body.clientId ?? '').trim()
  const clientSecret = (body.clientSecret ?? '').trim()
  const label = (body.label ?? '').trim()

  // Google client IDs look like 123456789012-abcdef.apps.googleusercontent.com.
  if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID must end with .apps.googleusercontent.com' })
  }
  if (clientSecret.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Client secret is required' })
  }

  // PKCE: random 32 bytes → base64url verifier, SHA-256 → base64url challenge.
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  const redirectUri = `${getBaseUrl(event)}/api/auth/gmail/callback`

  // Stash everything needed by the callback in the session. Survives
  // the round-trip to Google because nuxt-auth-utils encrypts the cookie.
  await setUserSession(event, {
    gmailPending: { clientId, clientSecret, verifier, state, label, redirectUri }
  })

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  // offline + consent guarantees we get a refresh_token. Without
  // prompt=consent, Google omits the refresh token on subsequent
  // re-auths for the same scopes.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  return { url: url.toString() }
})
