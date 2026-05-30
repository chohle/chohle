<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()
const { current, options, set } = useAppLocale()
const { tweaks, setTheme } = useTweaks()

const { data: sender } = await useFetch<{ email_template: string }>('/api/sender')
const template = ref(sender.value?.email_template ?? '')
const savingTemplate = ref(false)
async function saveTemplate() {
  savingTemplate.value = true
  try {
    await $fetch('/api/email-template', { method: 'PUT', body: { template: template.value } })
    toast.add({ title: t('settings.emailTemplateSaved'), color: 'success' })
  } finally { savingTemplate.value = false }
}

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
    // Only close the modal on success so a failed locale switch keeps the
    // confirmation visible and the user can retry or cancel.
    confirmOpen.value = false
  } finally {
    saving.value = false
  }
}
function cancelChange() { selected.value = current.value; confirmOpen.value = false }

const tab = ref<'appearance' | 'general' | 'email'>('appearance')
const tabs = computed(() => [
  { value: 'appearance', label: 'Appearance' },
  { value: 'general', label: t('settings.tabGeneral') },
  { value: 'email', label: t('settings.emailTemplate') }
])

const themes = [
  { value: 'light', label: 'Light' },
  { value: 'warm', label: 'Warm' },
  { value: 'dark', label: 'Dark' }
] as const
</script>

<template>
  <div class="page-settings">
    <UiPageHead :crumb="`${$t('nav.system')} / ${$t('user.settings')}`" :title="$t('user.settings')" :subtitle="$t('settings.subtitle')" />

    <div class="settings-grid">
      <nav class="inner-nav">
        <button
          v-for="t in tabs"
          :key="t.value"
          class="nav-item"
          :class="{ active: tab === t.value }"
          @click="tab = t.value as typeof tab"
        >{{ t.label }}</button>
      </nav>

      <div class="pane">
        <template v-if="tab === 'appearance'">
          <UiSectionLabel>{{ $t('settings.theme') }}</UiSectionLabel>
          <div class="theme-grid">
            <button
              v-for="th in themes"
              :key="th.value"
              class="theme-card"
              :class="{ active: tweaks.theme === th.value }"
              @click="setTheme(th.value)"
            >
              <span class="swatch" :data-theme="th.value">
                <span class="sw-ink" />
                <span class="sw-bar" />
              </span>
              <span class="th-name mono">{{ th.label }}</span>
            </button>
          </div>

        </template>

        <template v-else-if="tab === 'general'">
          <UiCard>
            <UFormField :label="t('user.language')">
              <USelect :model-value="selected" :items="options" class="w-48" @update:model-value="onPick" />
            </UFormField>
          </UiCard>

          <UiSectionLabel>{{ $t('settings.yourData') }}</UiSectionLabel>
          <UiCard>
            <i18n-t keypath="settings.yourDataText" tag="p" class="note" scope="global">
              <template #folder><code class="mono">data/</code></template>
            </i18n-t>
          </UiCard>
        </template>

        <template v-else-if="tab === 'email'">
          <p class="note">{{ $t('settings.emailTemplateHelp') }}</p>
          <ClientOnly>
            <UEditor
              v-model="template"
              content-type="html"
              :extensions="emailEditorExtensions"
              :handlers="emailEditorHandlers"
              :ui="{
                root: 'email-editor email-editor--tall',
                content: 'flex-1 overflow-y-auto'
              }"
            >
              <template #default="{ editor }">
                <UEditorToolbar :editor="editor" :items="emailEditorItems" class="flex-wrap email-editor__toolbar">
                  <template #link><EditorLinkPopover :editor="editor" /></template>
                </UEditorToolbar>
              </template>
            </UEditor>
            <template #fallback>
              <div class="email-editor email-editor--tall email-editor--fallback" />
            </template>
          </ClientOnly>
          <div class="email-foot">
            <div>
              <div class="eyebrow">{{ $t('settings.emailTemplatePlaceholders') }}</div>
              <div class="ph mono">
                <span><code>{customer}</code> {{ $t('settings.placeholderCustomer') }}</span>
                <span><code>{number}</code> {{ $t('settings.placeholderNumber') }}</span>
                <span><code>{due}</code> {{ $t('settings.placeholderDue') }}</span>
                <span><code>{sender}</code> {{ $t('settings.placeholderSender') }}</span>
              </div>
            </div>
            <button class="ed-btn-primary" :disabled="savingTemplate" @click="saveTemplate">{{ $t('common.save') }}</button>
          </div>
        </template>
      </div>
    </div>

    <UModal v-model:open="confirmOpen" :title="t('settings.languageConfirmTitle')">
      <template #body><p class="note">{{ t('settings.languageConfirmText') }}</p></template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="cancelChange">{{ t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="saving" @click="confirmChange">{{ t('common.confirm') }}</button>
        </div>
      </template>
    </UModal>
  </div>
</template>

