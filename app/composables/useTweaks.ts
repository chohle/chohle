import { effectScope } from 'vue'

export type Theme = 'light' | 'warm' | 'dark'

interface Tweaks {
  theme: Theme
}

const DEFAULTS: Tweaks = { theme: 'light' }
const STORAGE_KEY = 'batze.tweaks'

const state = ref<Tweaks>({ ...DEFAULTS })
let initialised = false

function apply(t: Tweaks) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', t.theme)
}

export function useTweaks() {
  if (!initialised && typeof window !== 'undefined') {
    initialised = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Tweaks>
        // Older clients persisted a `radius` field — ignore it silently
        // so removing the setting doesn't blow up on existing installs.
        if (parsed.theme) state.value.theme = parsed.theme
      }
    } catch {}
    apply(state.value)

    // Detached scope so the watcher survives the first caller's unmount.
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
    setTheme(theme: Theme) { state.value.theme = theme }
  }
}
