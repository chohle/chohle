<script setup lang="ts">
const colorMode = useColorMode()
const { t } = useI18n()
const toast = useToast()
const { current, options, set } = useAppLocale()

const { data: sender } = await useFetch<{ email_template: string }>('/api/sender')
const template = ref(sender.value?.email_template ?? '')
const savingTemplate = ref(false)
async function saveTemplate() {
  savingTemplate.value = true
  try {
    await $fetch('/api/email-template', { method: 'PUT', body: { template: template.value } })
    toast.add({ title: t('settings.emailTemplateSaved'), color: 'success' })
  } finally {
    savingTemplate.value = false
  }
}
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
        <h2 class="font-semibold">{{ $t('settings.emailTemplate') }}</h2>
      </template>
      <p class="mb-4 text-sm text-muted">{{ $t('settings.emailTemplateHelp') }}</p>
      <ClientOnly>
        <UEditor v-model="template" content-type="html" :extensions="emailEditorExtensions" class="min-h-40 rounded-md border border-default">
          <template #default="{ editor }">
            <UEditorToolbar :editor="editor" :items="emailEditorItems" class="flex-wrap border-b border-default px-1 py-1" />
          </template>
        </UEditor>
        <template #fallback>
          <div class="min-h-40 rounded-md border border-default" />
        </template>
      </ClientOnly>
      <p class="mt-2 text-xs text-muted">
        {{ $t('settings.emailTemplatePlaceholders') }}:
        <code>{customer}</code> <code>{number}</code> <code>{due}</code> <code>{sender}</code>
      </p>
      <div class="mt-4 flex justify-end">
        <UButton :loading="savingTemplate" @click="saveTemplate">{{ $t('common.save') }}</UButton>
      </div>
    </UCard>

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