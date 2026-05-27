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

  // Narrow a free-form string (e.g. a customer's stored language) to a
  // configured locale, falling back to 'en' when it isn't one we ship.
  function toLocale(value: string | null | undefined): typeof locale.value {
    const codes = (locales.value as LocaleObject[]).map(l => String(l.code))
    return value && codes.includes(value) ? (value as typeof locale.value) : 'en'
  }

  return { current: locale, options, set, toLocale }
}