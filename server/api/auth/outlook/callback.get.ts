// Step 2 of the Outlook OAuth PKCE flow.
//
// Microsoft redirects here after the user signs in. We validate the
// `state`, exchange the `code` + our stored `code_verifier` for an access
// token + refresh token, fetch the user's identity to capture the email
// address, then store the mailbox (tokens encrypted at rest) and bounce
// the browser back to /settings with a toast hint.

import { insertOutlookMailbox } from '~~/server/utils/mailbox'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}

interface MeResponse {
  userPrincipalName?: string
  mail?: string
  displayName?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const session = (await getUserSession(event)) as {
    outlookPending?: {
      clientId: string
      tenantId: string
      verifier: string
      state: string
      label: string
      redirectUri: string
    }
  }

  const pending = session.outlookPending
  if (!pending) {
    throw createError({ statusCode: 400, statusMessage: 'no pending Outlook flow' })
  }

  const q = getQuery(event)
  const code = String(q.code ?? '').trim()
  const returnedState = String(q.state ?? '').trim()
  const error = String(q.error ?? '').trim()

  // Always clear the pending state, even on failure, so a stale flow can't
  // be re-used by replaying the callback URL.
  await setUserSession(event, { outlookPending: undefined })

  if (error) {
    return sendRedirect(
      event,
      `/settings?mailbox=error&reason=${encodeURIComponent(error)}#mail-sync`
    )
  }
  if (!code || returnedState !== pending.state) {
    throw createError({ statusCode: 400, statusMessage: 'invalid callback parameters' })
  }

  // Exchange the auth code for tokens. PKCE means no client secret.
  const tokenUrl = `https://login.microsoftonline.com/${pending.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: pending.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier
  })

  const tokenRes = await $fetch<TokenResponse>(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }).catch((err) => {
    const msg =
      (err as { data?: { error_description?: string } }).data?.error_description ??
      'token exchange failed'
    throw createError({ statusCode: 502, statusMessage: msg, cause: err })
  })

  // Resolve the user's email so the Settings list can show "you@org.ch"
  // next to the connection. Microsoft Graph returns `mail` for tenants
  // and `userPrincipalName` as a fallback.
  const me = await $fetch<MeResponse>('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` }
  }).catch(() => ({}) as MeResponse)

  const emailAddress = (me.mail || me.userPrincipalName || '').trim() || null
  const label = pending.label || me.displayName || 'Outlook'

  // insertOutlookMailbox is synchronous (better-sqlite3), no await needed.
  // We do wrap it so an SQLite or encryption failure surfaces as a clear
  // error redirect instead of a generic 500 leaking back to the user.
  try {
    insertOutlookMailbox(useDb(), {
      label,
      emailAddress,
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresInSeconds: tokenRes.expires_in,
      clientId: pending.clientId,
      tenantId: pending.tenantId
    })
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'insert failed'
    console.error('[outlook-oauth] insert mailbox failed:', msg)
    return sendRedirect(
      event,
      `/settings?mailbox=error&reason=${encodeURIComponent(msg)}#mail-sync`
    )
  }

  return sendRedirect(event, '/settings?mailbox=connected#mail-sync')
})
