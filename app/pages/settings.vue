<script setup lang="ts">
const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()
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

// --- Mail sync ---------------------------------------------------------
interface MailboxRow {
  id: number
  provider: 'outlook' | 'gmail' | 'imap'
  provider_label: string
  label: string
  email_address: string | null
  token_expires_at: string | null
  last_sync_at: string | null
  last_error: string | null
  created_at: string
}
const { data: mailboxes, refresh: refreshMailboxes } = await useFetch<MailboxRow[]>('/api/mailboxes', { default: () => [] })

const connectOpen = ref(false)
const connectGmailOpen = ref(false)
const connectImapOpen = ref(false)
const connecting = ref(false)
const outlookForm = reactive({
  clientId: '',
  tenantId: 'common',
  label: ''
})
const gmailForm = reactive({
  clientId: '',
  clientSecret: '',
  label: ''
})
const imapForm = reactive({
  host: '',
  port: 993,
  user: '',
  password: '',
  label: ''
})

function openConnectOutlook() {
  outlookForm.clientId = ''
  outlookForm.tenantId = 'common'
  outlookForm.label = ''
  connectOpen.value = true
}

function openConnectGmail() {
  gmailForm.clientId = ''
  gmailForm.clientSecret = ''
  gmailForm.label = ''
  connectGmailOpen.value = true
}

function openConnectImap() {
  imapForm.host = ''
  imapForm.port = 993
  imapForm.user = ''
  imapForm.password = ''
  imapForm.label = ''
  connectImapOpen.value = true
}

async function startOutlookConnect() {
  connecting.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/outlook/start', {
      method: 'POST',
      body: { clientId: outlookForm.clientId.trim(), tenantId: outlookForm.tenantId.trim(), label: outlookForm.label.trim() }
    })
    window.location.href = url
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('settings.mailSync.connectFailed')
    toast.add({ title: msg, color: 'error' })
  } finally { connecting.value = false }
}

async function startGmailConnect() {
  connecting.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/gmail/start', {
      method: 'POST',
      body: { clientId: gmailForm.clientId.trim(), clientSecret: gmailForm.clientSecret.trim(), label: gmailForm.label.trim() }
    })
    window.location.href = url
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('settings.mailSync.connectFailed')
    toast.add({ title: msg, color: 'error' })
  } finally { connecting.value = false }
}

async function startImapConnect() {
  connecting.value = true
  try {
    await $fetch('/api/auth/imap/connect', {
      method: 'POST',
      body: {
        host: imapForm.host.trim(),
        port: Number(imapForm.port),
        user: imapForm.user.trim(),
        password: imapForm.password,
        label: imapForm.label.trim()
      }
    })
    connectImapOpen.value = false
    toast.add({ title: t('settings.mailSync.connected'), color: 'success' })
    await refreshMailboxes()
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('settings.mailSync.connectFailed')
    toast.add({ title: msg, color: 'error' })
  } finally { connecting.value = false }
}

async function disconnect(id: number) {
  try {
    await $fetch(`/api/mailboxes/${id}`, { method: 'DELETE' })
    await refreshMailboxes()
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('settings.mailSync.disconnectFailed')
    toast.add({ title: msg, color: 'error' })
  }
}

const syncingId = ref<number | null>(null)
async function syncNow(id: number) {
  syncingId.value = id
  try {
    const r = await $fetch<{ inserted: number; scanned: number; duplicates: number }>(
      `/api/mailboxes/${id}/sync`, { method: 'POST' }
    )
    toast.add({
      title: r.inserted > 0
        ? t('settings.mailSync.syncedWithNew', { n: r.inserted })
        : t('settings.mailSync.syncedNothingNew'),
      color: 'success'
    })
    await refreshMailboxes()
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('settings.mailSync.syncFailed')
    toast.add({ title: msg, color: 'error' })
    await refreshMailboxes()
  } finally { syncingId.value = null }
}

// React to the post-OAuth redirect (`?mailbox=connected` or `=error`)
onMounted(() => {
  const status = route.query.mailbox
  if (status === 'connected') {
    toast.add({ title: t('settings.mailSync.connected'), color: 'success' })
    refreshMailboxes()
  } else if (status === 'error') {
    const reason = String(route.query.reason ?? '')
    toast.add({ title: t('settings.mailSync.connectFailed') + (reason ? `: ${reason}` : ''), color: 'error' })
  }
  if (status) {
    // Clear the query so a reload doesn't re-fire the toast.
    router.replace({ query: { ...route.query, mailbox: undefined, reason: undefined } })
  }
})

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

type Tab = 'appearance' | 'general' | 'mail' | 'email'
// Hash-driven so the OAuth callback's `#mail-sync` redirect lands on the
// right tab without a separate state ping pong.
const tab = ref<Tab>(route.hash === '#mail-sync' ? 'mail' : 'appearance')
const tabs = computed(() => [
  { value: 'appearance', label: 'Appearance' },
  { value: 'general', label: t('settings.tabGeneral') },
  { value: 'mail', label: t('settings.mailSync.tab') },
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

        <template v-else-if="tab === 'mail'">
          <p class="note">{{ $t('settings.mailSync.intro') }}</p>

          <UiSectionLabel>{{ $t('settings.mailSync.connected') }}</UiSectionLabel>
          <UiCard v-if="!mailboxes.length" :flush="true" class="mail-sync__empty">
            <EmptyState
              :bordered="false"
              icon="i-lucide-mail"
              :title="$t('settings.mailSync.emptyTitle')"
              :description="$t('settings.mailSync.emptyText')"
            />
          </UiCard>
          <UiCard v-else :flush="true">
            <ul class="mail-sync__list">
              <li v-for="mb in mailboxes" :key="mb.id" class="mail-sync__row">
                <div class="mail-sync__row-main">
                  <div class="mail-sync__row-name">{{ mb.label }}</div>
                  <div class="mail-sync__row-meta mono">
                    <span>{{ mb.provider_label }}</span>
                    <span v-if="mb.email_address">· {{ mb.email_address }}</span>
                    <span v-if="mb.last_sync_at">· {{ $t('settings.mailSync.lastSync') }} {{ dateCh(mb.last_sync_at.slice(0, 10)) }}</span>
                    <span v-else>· {{ $t('settings.mailSync.neverSynced') }}</span>
                  </div>
                  <div v-if="mb.last_error" class="mail-sync__row-error">{{ mb.last_error }}</div>
                </div>
                <div class="mail-sync__row-actions">
                  <button class="ed-btn" type="button" :disabled="syncingId === mb.id" @click="syncNow(mb.id)">
                    <UIcon :name="syncingId === mb.id ? 'i-lucide-loader-2' : 'i-lucide-refresh-cw'" class="size-3.5" :class="{ 'animate-spin': syncingId === mb.id }" />
                    {{ $t('settings.mailSync.syncNow') }}
                  </button>
                  <button class="ed-btn" type="button" @click="disconnect(mb.id)">
                    <UIcon name="i-lucide-trash-2" class="size-3.5" />
                    {{ $t('settings.mailSync.disconnect') }}
                  </button>
                </div>
              </li>
            </ul>
          </UiCard>

          <UiSectionLabel>{{ $t('settings.mailSync.connect') }}</UiSectionLabel>
          <UiCard>
            <div class="mail-sync__providers">
              <button class="mail-sync__provider" type="button" @click="openConnectOutlook">
                <UIcon name="i-lucide-mail" class="size-5" />
                <div>
                  <div class="mail-sync__provider-name">Outlook / Microsoft 365</div>
                  <div class="mail-sync__provider-desc mono">{{ $t('settings.mailSync.outlookDesc') }}</div>
                </div>
              </button>
              <button class="mail-sync__provider" type="button" @click="openConnectGmail">
                <UIcon name="i-lucide-mail" class="size-5" />
                <div>
                  <div class="mail-sync__provider-name">Google / Gmail</div>
                  <div class="mail-sync__provider-desc mono">{{ $t('settings.mailSync.gmailDesc') }}</div>
                </div>
              </button>
              <button class="mail-sync__provider" type="button" @click="openConnectImap">
                <UIcon name="i-lucide-mail" class="size-5" />
                <div>
                  <div class="mail-sync__provider-name">IMAP (Proton, Fastmail, iCloud, …)</div>
                  <div class="mail-sync__provider-desc mono">{{ $t('settings.mailSync.imapDesc') }}</div>
                </div>
              </button>
            </div>
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

    <UModal v-model:open="connectImapOpen" :title="$t('settings.mailSync.imapConnectTitle')">
      <template #body>
        <p class="note">{{ $t('settings.mailSync.imapConnectHint') }}</p>
        <form class="flex flex-col gap-3 mt-3" novalidate @submit.prevent="startImapConnect">
          <div class="grid grid-cols-3 gap-3">
            <UFormField :label="$t('settings.mailSync.imapHost')" class="col-span-2">
              <UInput v-model="imapForm.host" placeholder="imap.example.com" class="w-full mono" />
            </UFormField>
            <UFormField :label="$t('settings.mailSync.imapPort')">
              <UInput v-model.number="imapForm.port" type="number" class="w-full mono" />
            </UFormField>
          </div>
          <UFormField :label="$t('settings.mailSync.imapUser')" :help="$t('settings.mailSync.imapUserHelp')">
            <UInput v-model="imapForm.user" placeholder="you@example.com" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.imapPassword')" :help="$t('settings.mailSync.imapPasswordHelp')">
            <UInput v-model="imapForm.password" type="password" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.connectionLabel')" :help="$t('settings.mailSync.connectionLabelHelp')">
            <UInput v-model="imapForm.label" placeholder="Work inbox" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="connectImapOpen = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="connecting || !imapForm.host.trim() || !imapForm.user.trim() || !imapForm.password" @click="startImapConnect">
            <UIcon name="i-lucide-plug" class="size-3.5" />
            {{ $t('settings.mailSync.testAndConnect') }}
          </button>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="connectGmailOpen" :title="$t('settings.mailSync.gmailConnectTitle')">
      <template #body>
        <p class="note">{{ $t('settings.mailSync.gmailConnectHint') }}</p>
        <form class="flex flex-col gap-3 mt-3" novalidate @submit.prevent="startGmailConnect">
          <UFormField :label="$t('settings.mailSync.clientId')" :help="$t('settings.mailSync.gmailClientIdHelp')">
            <UInput v-model="gmailForm.clientId" placeholder="123456789012-abc.apps.googleusercontent.com" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.clientSecret')" :help="$t('settings.mailSync.clientSecretHelp')">
            <UInput v-model="gmailForm.clientSecret" type="password" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.connectionLabel')" :help="$t('settings.mailSync.connectionLabelHelp')">
            <UInput v-model="gmailForm.label" placeholder="Work inbox" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="connectGmailOpen = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="connecting || !gmailForm.clientId.trim() || !gmailForm.clientSecret.trim()" @click="startGmailConnect">
            <UIcon name="i-lucide-external-link" class="size-3.5" />
            {{ $t('settings.mailSync.signInWith', { provider: 'Google' }) }}
          </button>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="connectOpen" :title="$t('settings.mailSync.outlookConnectTitle')">
      <template #body>
        <p class="note">{{ $t('settings.mailSync.outlookConnectHint') }}</p>
        <form class="flex flex-col gap-3 mt-3" novalidate @submit.prevent="startOutlookConnect">
          <UFormField :label="$t('settings.mailSync.clientId')" :help="$t('settings.mailSync.clientIdHelp')">
            <UInput v-model="outlookForm.clientId" placeholder="00000000-0000-0000-0000-000000000000" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.tenantId')" :help="$t('settings.mailSync.tenantIdHelp')">
            <UInput v-model="outlookForm.tenantId" class="w-full mono" />
          </UFormField>
          <UFormField :label="$t('settings.mailSync.connectionLabel')" :help="$t('settings.mailSync.connectionLabelHelp')">
            <UInput v-model="outlookForm.label" placeholder="Work inbox" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="connectOpen = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="connecting || !outlookForm.clientId.trim()" @click="startOutlookConnect">
            <UIcon name="i-lucide-external-link" class="size-3.5" />
            {{ $t('settings.mailSync.signInWith', { provider: 'Microsoft' }) }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>

