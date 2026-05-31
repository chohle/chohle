// Step 2 of the Gmail OAuth PKCE flow.
//
// Google redirects here after the user signs in. We validate the
// `state`, exchange the `code` + our stored `code_verifier` +
// `client_secret` for an access token + refresh token, fetch the
// userinfo to capture the email address, then store the mailbox
// (tokens + secret encrypted at rest) and bounce the browser back
// to /settings with a toast hint.

import { insertGmailMailbox } from '~~/server/utils/mailbox'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

interface UserinfoResponse {
  email?: string
  name?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const session = (await getUserSession(event)) as {
    gmailPending?: {
      clientId: string
      clientSecret: string
      verifier: string
      state: string
      label: string
      redirectUri: string
    }
  }

  const pending = session.gmailPending
  if (!pending) {
    throw createError({ statusCode: 400, statusMessage: 'no pending Gmail flow' })
  }

  const q = getQuery(event)
  const code = String(q.code ?? '').trim()
  const returnedState = String(q.state ?? '').trim()
  const error = String(q.error ?? '').trim()

  // Always clear the pending state, even on failure, so a stale flow
  // can't be re-used by replaying the callback URL.
  await setUserSession(event, { gmailPending: undefined })

  if (error) {
    return sendRedirect(
      event,
      `/settings?mailbox=error&reason=${encodeURIComponent(error)}#mail-sync`
    )
  }
  if (!code || returnedState !== pending.state) {
    throw createError({ statusCode: 400, statusMessage: 'invalid callback parameters' })
  }

  // Exchange the auth code for tokens. Google's Web client requires
  // BOTH client_secret and code_verifier even when PKCE is enabled.
  const body = new URLSearchParams({
    client_id: pending.clientId,
    client_secret: pending.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier
  })

  const tokenRes = await $fetch<TokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }).catch((err) => {
    const data = (err as { data?: { error_description?: string; error?: string } }).data
    const msg = data?.error_description ?? data?.error ?? 'token exchange failed'
    throw createError({ statusCode: 502, statusMessage: msg, cause: err })
  })

  if (!tokenRes.refresh_token) {
    // Should not happen with access_type=offline + prompt=consent, but
    // surface clearly if Google omits it (would brick the sync worker
    // as soon as the access token expires in an hour).
    return sendRedirect(
      event,
      `/settings?mailbox=error&reason=${encodeURIComponent('Google did not return a refresh_token; reconnect required')}#mail-sync`
    )
  }

  // Resolve the user's email so the Settings list can show it.
  const me = await $fetch<UserinfoResponse>('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` }
  }).catch(() => ({}) as UserinfoResponse)

  const emailAddress = (me.email ?? '').trim() || null
  const label = pending.label || me.name || 'Gmail'

  // insertGmailMailbox is synchronous (better-sqlite3), no await needed.
  // We do wrap it so an SQLite or encryption failure surfaces as a clear
  // error redirect instead of a generic 500 leaking back to the user.
  try {
    insertGmailMailbox(useDb(), {
      label,
      emailAddress,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresInSeconds: tokenRes.expires_in,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret
    })
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'insert failed'
    console.error('[gmail-oauth] insert mailbox failed:', msg)
    return sendRedirect(
      event,
      `/settings?mailbox=error&reason=${encodeURIComponent(msg)}#mail-sync`
    )
  }

  return sendRedirect(event, '/settings?mailbox=connected#mail-sync')
})
