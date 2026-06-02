// Reset the visitor's demo sandbox back to a pristine seeded template, in the
// language the app is currently in (the session owner's locale). Demo-only.

import { DEMO_COOKIE, isDemo, resetSessionDb } from '~~/server/utils/demo'

export default defineEventHandler(async (event) => {
  if (!isDemo()) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const sid = getCookie(event, DEMO_COOKIE)
  if (!sid) {
    throw createError({ statusCode: 400, statusMessage: 'No demo session' })
  }

  // Reseed in whatever language this sandbox is currently set to.
  const locale =
    (
      useDb().prepare('SELECT locale FROM owner WHERE id = 1').get() as
        | { locale: string }
        | undefined
    )?.locale ?? 'en'

  resetSessionDb(sid, locale)
  return { ok: true }
})
