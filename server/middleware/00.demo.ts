// Demo mode wiring (runs only when CHOHLE_DEMO=true). For each request it:
//   1. blocks endpoints that reach external services (mailbox connect/sync) so
//      a public visitor can't make the demo talk to real bank/mail servers,
//   2. ensures a demo_sid cookie (the visitor's sandbox identity),
//   3. binds that session's database to event.context so useDb() resolves it,
//   4. auto-logins a guest so the app's requireUserSession() gates pass with no
//      login wall.
// The seed language for a brand-new sandbox follows the browser's
// Accept-Language; switching the UI later (or Reset) reseeds in that language.

import {
  DEMO_COOKIE,
  isDemo,
  newSessionId,
  normLocale,
  resolveSessionDb
} from '~~/server/utils/demo'

function initialLocale(event: Parameters<typeof getHeader>[0]): string {
  const header = getHeader(event, 'accept-language') || ''
  const tag = header.split(',')[0]?.trim().slice(0, 2).toLowerCase()
  return normLocale(tag)
}

// Endpoints that open a connection to a real external service (IMAP/SMTP
// servers, Gmail/Outlook OAuth + sync). Harmless local routes — listing or
// deleting mailbox rows — stay available inside the sandbox.
function reachesExternalService(path: string): boolean {
  return (
    path === '/api/auth/imap/connect' ||
    path.startsWith('/api/auth/gmail/') ||
    path.startsWith('/api/auth/outlook/') ||
    // The assistant drives an external LLM; never let a public demo visitor
    // reach it (and it could create records).
    path.startsWith('/api/assistant/') ||
    /^\/api\/mailboxes\/\d+\/sync$/.test(path)
  )
}

export default defineEventHandler(async (event) => {
  if (!isDemo()) return

  const path = (event.path || '').split('?')[0]!
  if (reachesExternalService(path)) {
    throw createError({ statusCode: 403, statusMessage: 'Disabled in the demo' })
  }

  let sid = getCookie(event, DEMO_COOKIE)
  if (!sid || !/^[a-f0-9]{32}$/.test(sid)) {
    sid = newSessionId()
    setCookie(event, DEMO_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    })
  }

  event.context.demoDb = resolveSessionDb(sid, initialLocale(event))

  // No login wall for a public demo: ensure a guest session exists so every
  // existing requireUserSession() call downstream just passes.
  const session = await getUserSession(event)
  if (!session?.user) {
    await setUserSession(event, { user: { username: 'demo' } })
  }
})
