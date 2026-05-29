import { effectScope } from 'vue'

export type Theme = 'light' | 'warm' | 'dark'

interface Tweaks {
  theme: Theme
  radius: number
}

const DEFAULTS: Tweaks = { theme: 'light', radius: 4 }
const STORAGE_KEY = 'batze.tweaks'

const state = ref<Tweaks>({ ...DEFAULTS })
let initialised = false

function apply(t: Tweaks) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.setAttribute('data-theme', t.theme)
  html.style.setProperty('--radius', `${t.radius}px`)
  html.style.setProperty('--radius-sm', `${Math.max(0, t.radius - 1)}px`)
  html.style.setProperty('--radius-xs', `${Math.max(0, t.radius - 2)}px`)
}

export function useTweaks() {
  if (!initialised && typeof window !== 'undefined') {
    initialised = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) Object.assign(state.value, JSON.parse(raw))
    } catch {}
    apply(state.value)

    // Detached scope so the watcher survives the first caller's unmount.
    // Without this the persistence + apply() effect dies whichever component
    // happened to call useTweaks() first.
    const scope = effectScope(true)
    scope.run(() => {
      watch(state, (v) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch {}
        apply(v)
      }, { deep: true })
    })
  }

  return {
    tweaks: state,
    setTheme(theme: Theme) { state.value.theme = theme },
    setRadius(radius: number) { state.value.radius = Math.max(0, Math.min(20, radius)) }
  }
}
