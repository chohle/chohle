import type { LocaleObject } from '@nuxtjs/i18n'

// Locale switch persisted to the owner record; the session then carries it so
// reloads render in the saved language (see plugins/i18n-restore).
export function useAppLocale() {
  const { locale, locales, setLocale } = useI18n()
  const { fetch: refreshSession } = useUserSession()

  const options = computed(() =>
    (locales.value as LocaleObject[]).map(l => ({ value: l.code, label: l.name ?? l.code }))
  )

  async function set(code: string) {
    await $fetch('/api/locale', { method: 'PUT', body: { locale: code } })
    await setLocale(code as Parameters<typeof setLocale>[0])
    await refreshSession()
  }

  return { current: locale, options, set }
}