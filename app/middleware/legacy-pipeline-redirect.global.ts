// The pipeline routes used to be German (/vertrieb, /einkauf). They are now
// English (/sales, /procurement). Permanently redirect any lingering legacy
// links or bookmarks so they don't 404.
const LEGACY_SLUGS: Record<string, string> = {
  vertrieb: 'sales',
  einkauf: 'procurement'
}

export default defineNuxtRouteMiddleware((to) => {
  const [, first, ...rest] = to.path.split('/')
  const mapped = LEGACY_SLUGS[first ?? '']
  if (!mapped) return

  const path = '/' + [mapped, ...rest].join('/')
  return navigateTo({ path, query: to.query, hash: to.hash }, { redirectCode: 301 })
})
