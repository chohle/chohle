// Persisted desktop preference: icon-only collapsed sidebar.
// Mobile uses the drawer (useMobileNav), independent of this.
//
// Stored in a cookie (not localStorage) so the server can read it during
// SSR and render the correct collapsed/expanded state on first paint. That
// keeps the `is-collapsed` class and the `--sidebar-w` width in sync and
// avoids the hydration flash where a narrow column briefly shows full labels.

const STORAGE_KEY = 'chohle.sidebar-collapsed'

export function useSidebarCollapse() {
  const cookie = useCookie<boolean>(STORAGE_KEY, {
    default: () => false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })

  // Shared reactive state seeded from the cookie so SSR and every component
  // (layout, sidebar, topbar) read the same value; the cookie is persistence.
  const state = useState<boolean>('sidebar-collapsed', () => !!cookie.value)

  const isCollapsed = computed({
    get: () => state.value,
    set: (v) => {
      state.value = v
      cookie.value = v
    }
  })

  return {
    isCollapsed,
    toggle() {
      isCollapsed.value = !isCollapsed.value
    }
  }
}
