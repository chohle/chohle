// Apply the owner's stored locale (carried in the session) on load and after
// login, so the app renders in the saved language with no flash.
export default defineNuxtPlugin(async (nuxtApp) => {
  const { user } = useUserSession()
  const i18n = nuxtApp.$i18n as {
    locales: Ref<{ code: string }[]>
    setLocale: (code: string) => Promise<void>
  }

  const apply = async (code?: string) => {
    if (code && i18n.locales.value.some((l) => l.code === code)) await i18n.setLocale(code)
  }

  await apply((user.value as { locale?: string } | null)?.locale)
  watch(() => (user.value as { locale?: string } | null)?.locale, apply)
})
