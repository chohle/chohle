// Persisted desktop preference: icon-only collapsed sidebar.
// Mobile uses the drawer (useMobileNav), independent of this.

const STORAGE_KEY = 'batze.sidebar-collapsed'
const COLLAPSED_W = '64px'
const EXPANDED_W = '232px'

const isCollapsed = ref(false)
let initialised = false

function applyWidth(collapsed: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--sidebar-w', collapsed ? COLLAPSED_W : EXPANDED_W)
}

export function useSidebarCollapse() {
  if (!initialised && typeof window !== 'undefined') {
    initialised = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === '1') isCollapsed.value = true
    } catch {}
    applyWidth(isCollapsed.value)
    watch(isCollapsed, (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
      } catch {}
      applyWidth(v)
    })
  }

  return {
    isCollapsed,
    toggle() {
      isCollapsed.value = !isCollapsed.value
    }
  }
}
