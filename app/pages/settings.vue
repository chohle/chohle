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

function onPick(code: typeof current.value) {
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

const tabItems = computed(() => [
  { label: t('settings.tabGeneral'), icon: 'i-lucide-sliders-horizontal', slot: 'general' },
  { label: t('settings.emailTemplate'), icon: 'i-lucide-mail', slot: 'email' }
])
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader :title="$t('user.settings')" :description="$t('settings.subtitle')" />

    <UTabs :items="tabItems" variant="link" class="w-full">
      <template #general>
        <div class="mt-4 space-y-6">
          <UCard>
            <UFormField :label="$t('settings.appearance')" :help="$t('settings.appearanceHelp')">
              <USelect v-model="colorMode.preference" :items="appearanceItems" class="w-48" />
            </UFormField>
            <UFormField :label="t('user.language')" class="mt-4">
              <USelect
                :model-value="selected"
                :items="options"
                class="w-48"
                @update:model-value="onPick"
              />
            </UFormField>
          </UCard>

          <UCard>
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

      <template #email>
        <div class="mt-4 flex flex-col gap-3">
          <p class="text-sm text-muted">{{ $t('settings.emailTemplateHelp') }}</p>

          <ClientOnly>
            <UEditor
              v-model="template"
              content-type="html"
              :extensions="emailEditorExtensions"
              :handlers="emailEditorHandlers"
              :ui="{
                root: 'flex flex-col h-[500px] min-h-[18rem] resize-y overflow-hidden rounded-lg border border-default bg-default',
                content: 'flex-1 overflow-y-auto py-4'
              }"
            >
              <template #default="{ editor }">
                <UEditorToolbar :editor="editor" :items="emailEditorItems" class="flex-wrap border-b border-default px-2 py-1.5">
                  <template #link>
                    <EditorLinkPopover :editor="editor" />
                  </template>
                </UEditorToolbar>
              </template>
            </UEditor>
            <template #fallback>
              <div class="h-[500px] rounded-lg border border-default" />
            </template>
          </ClientOnly>

          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="mb-1 text-xs font-medium text-muted">{{ $t('settings.emailTemplatePlaceholders') }}</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span class="inline-flex items-center gap-1.5"><code>{customer}</code> {{ $t('settings.placeholderCustomer') }}</span>
                <span class="inline-flex items-center gap-1.5"><code>{number}</code> {{ $t('settings.placeholderNumber') }}</span>
                <span class="inline-flex items-center gap-1.5"><code>{due}</code> {{ $t('settings.placeholderDue') }}</span>
                <span class="inline-flex items-center gap-1.5"><code>{sender}</code> {{ $t('settings.placeholderSender') }}</span>
              </div>
            </div>
            <UButton :loading="savingTemplate" @click="saveTemplate">{{ $t('common.save') }}</UButton>
          </div>
        </div>
      </template>
    </UTabs>

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
  </div>
</template>
