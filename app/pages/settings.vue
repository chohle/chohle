<script setup lang="ts">
const colorMode = useColorMode()
const { t } = useI18n()
const { current, options, set } = useAppLocale()
const appearanceItems = computed(() => [
  { label: t('settings.themeSystem'), value: 'system' },
  { label: t('settings.themeLight'), value: 'light' },
  { label: t('settings.themeDark'), value: 'dark' }
])

const selected = ref(current.value)
watch(current, v => { selected.value = v })

const confirmOpen = ref(false)
const target = ref(current.value)
const saving = ref(false)

function onPick(code: string) {
  if (code === current.value) return
  target.value = code
  confirmOpen.value = true
}

async function confirmChange() {
  saving.value = true
  try {
    await set(target.value)
  } finally {
    saving.value = false
    confirmOpen.value = false
  }
}

function cancelChange() {
  selected.value = current.value
  confirmOpen.value = false
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader :title="$t('user.settings')" :description="$t('settings.subtitle')" />

    <UCard>
      <UFormField :label="$t('settings.appearance')" :help="$t('settings.appearanceHelp')">
        <USelect v-model="colorMode.preference" :items="appearanceItems" class="w-40" />
      </UFormField>
      <UFormField :label="t('user.language')" class="mt-4">
        <USelect
          :model-value="selected"
          :items="options"
          class="w-40"
          @update:model-value="onPick"
        />
      </UFormField>
    </UCard>

    <UModal v-model:open="confirmOpen" :title="t('settings.languageConfirmTitle')">
      <template #body>
        <p class="text-sm text-muted">{{ t('settings.languageConfirmText') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="cancelChange" />
          <UButton :loading="saving" :label="t('common.confirm')" @click="confirmChange" />
        </div>
      </template>
    </UModal>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">{{ $t('settings.yourData') }}</h2>
      </template>
      <i18n-t keypath="settings.yourDataText" tag="p" class="text-sm text-muted" scope="global">
        <template #folder>
          <code class="text-default">data/</code>
        </template>
      </i18n-t>
    </UCard>
  </div>
</template>