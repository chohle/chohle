// Demo mode wiring (runs only when CHOHLE_DEMO=true). For each request it:
//   1. ensures a demo_sid cookie (the visitor's sandbox identity),
//   2. binds that session's database to event.context so useDb() resolves it,
//   3. auto-logins a guest so the app's requireUserSession() gates pass with no
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

export default defineEventHandler(async (event) => {
  if (!isDemo()) return

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
