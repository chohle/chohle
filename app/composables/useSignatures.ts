// Shared signature list for the compose surfaces (project composer, invoice and
// quote sends). Exposes the rows, the default's id (to preselect), and ready-made
// USelect items including a "no signature" option.
export function useSignatures() {
  const { t } = useI18n()
  const { data } = useFetch<{ rows: { id: number; name: string; is_default: number }[] }>(
    '/api/signatures'
  )
  const signatures = computed(() => data.value?.rows ?? [])
  const defaultSignatureId = computed(() => signatures.value.find((s) => s.is_default)?.id ?? null)
  const signatureItems = computed(() => [
    { label: t('settings.signatures.none'), value: null as number | null },
    ...signatures.value.map((s) => ({ label: s.name, value: s.id as number | null }))
  ])
  return { signatures, defaultSignatureId, signatureItems }
}
