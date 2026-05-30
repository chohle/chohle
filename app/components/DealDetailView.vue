<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

type Direction = 'sales' | 'procurement'
type Stage = 'lead' | 'contacted' | 'proposal' | 'won' | 'need' | 'requested' | 'received' | 'accepted'

interface DealDetail {
  id: number
  name: string
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  email: string | null
  phone: string | null
  direction: Direction
  stage: Stage
  label: string
  value_rappen: number
  due_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface DealEmail {
  id: number
  deal_id: number
  direction: 'outbound' | 'inbound'
  from_address: string | null
  to_address: string | null
  subject: string
  body_html: string
  body_text: string
  sent_at: string
  created_at: string
}

const props = defineProps<{ direction: Direction; id: string }>()

const DIR_TO_SLUG: Record<Direction, string> = { sales: 'vertrieb', procurement: 'einkauf' }
const SALES_STAGES: Stage[] = ['lead', 'contacted', 'proposal', 'won']
const PROC_STAGES: Stage[] = ['need', 'requested', 'received', 'accepted']

const { t } = useI18n()
const toast = useToast()

const { data: deal, refresh: refreshDeal } = await useFetch<DealDetail>(`/api/deals/${props.id}`)
const { data: emails, refresh: refreshEmails } = await useFetch<{ rows: DealEmail[] }>(`/api/deals/${props.id}/emails`, {
  default: () => ({ rows: [] })
})

// Bounce to the correct slug if the URL direction doesn't match the deal's.
if (deal.value && deal.value.direction !== props.direction) {
  await navigateTo(`/${DIR_TO_SLUG[deal.value.direction]}/${deal.value.id}`, { replace: true })
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtTimestamp(s: string) {
  const ymd = s.slice(0, 10)
  const hm = s.slice(11, 16)
  return hm ? `${dateCh(ymd)} · ${hm}` : dateCh(ymd)
}

const STAGE_LABEL = computed<Record<Stage, string>>(() => ({
  lead: t('pipeline.stage.lead'),
  contacted: t('pipeline.stage.contacted'),
  proposal: t('pipeline.stage.proposal'),
  won: t('pipeline.stage.won'),
  need: t('pipeline.stage.need'),
  requested: t('pipeline.stage.requested'),
  received: t('pipeline.stage.received'),
  accepted: t('pipeline.stage.accepted')
}))

const stageOptions = computed(() => {
  if (!deal.value) return []
  const stages = deal.value.direction === 'procurement' ? PROC_STAGES : SALES_STAGES
  return stages.map(s => ({ value: s, label: STAGE_LABEL.value[s] }))
})

async function changeStage(newStage: Stage) {
  if (!deal.value || deal.value.stage === newStage) return
  await $fetch(`/api/deals/${props.id}`, {
    method: 'PUT',
    body: { stage: newStage }
  })
  await refreshDeal()
}

// Basic RFC-ish check — good enough to catch typos like "aadsf" without
// rejecting valid edge cases. Server is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// --- Compose & send ---
const composer = reactive({
  open: false,
  subject: '',
  to: '',
  body_html: ''
})
const composerError = ref('')
const sending = ref(false)

function validateComposerTo(): boolean {
  const v = composer.to.trim()
  if (!v) { composerError.value = t('validation.required'); return false }
  if (!EMAIL_RE.test(v)) { composerError.value = t('validation.email'); return false }
  composerError.value = ''
  return true
}
watch(() => composer.to, () => { if (composerError.value) validateComposerTo() })

// Resolve contact via the API's COALESCEd value first, then the raw deal
// fields. Belt-and-braces: handles edge cases where the linked customer has
// an empty-string email but the deal has its own inline one.
const resolvedEmail = computed(() => deal.value?.customer_email || deal.value?.email || '')
const resolvedPhone = computed(() => deal.value?.customer_phone || deal.value?.phone || '')

function openCompose() {
  composer.open = true
  composer.to = resolvedEmail.value
  composer.subject = ''
  composer.body_html = ''
  composerError.value = ''
}

async function send() {
  if (!validateComposerTo()) return
  if (!composer.subject.trim() || !composer.body_html.trim()) return
  sending.value = true
  try {
    await $fetch(`/api/deals/${props.id}/emails`, {
      method: 'POST',
      body: {
        subject: composer.subject.trim(),
        to: composer.to.trim() || undefined,
        body_html: composer.body_html
      }
    })
    composer.open = false
    await refreshEmails()
    toast.add({ title: t('pipeline.detail.emailSent'), color: 'success' })
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('pipeline.detail.emailFailed')
    toast.add({ title: msg, color: 'error' })
  } finally { sending.value = false }
}

// --- Paste a reply ---
const reply = reactive({
  open: false,
  subject: '',
  from: '',
  body_text: ''
})
const replyError = ref('')
const logging = ref(false)

// Reply From is optional (you may not know the sender for a verbal/phone
// log), but if provided, it has to look like an email.
function validateReplyFrom(): boolean {
  const v = reply.from.trim()
  if (v && !EMAIL_RE.test(v)) { replyError.value = t('validation.email'); return false }
  replyError.value = ''
  return true
}
watch(() => reply.from, () => { if (replyError.value) validateReplyFrom() })

function openLogReply() {
  reply.open = true
  reply.subject = ''
  reply.from = resolvedEmail.value
  reply.body_text = ''
  replyError.value = ''
}

// Sanitize inbound HTML before binding via v-html. The body is generated by
// our own editor today, but treating stored HTML as untrusted is the safer
// default against future input paths (paste, manual DB inserts, imports).
function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

async function logReply() {
  if (!validateReplyFrom()) return
  if (!reply.subject.trim() && !reply.body_text.trim()) return
  logging.value = true
  try {
    await $fetch(`/api/deals/${props.id}/emails/log`, {
      method: 'POST',
      body: {
        subject: reply.subject.trim(),
        from: reply.from.trim() || null,
        body_text: reply.body_text
      }
    })
    reply.open = false
    await refreshEmails()
  } finally { logging.value = false }
}

const initials = computed(() => {
  const n = deal.value?.customer_name || deal.value?.name || ''
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
})

const subscribeWord = computed(() => deal.value?.direction === 'procurement' ? t('pipeline.detail.supplier') : t('pipeline.detail.contact'))
const backHref = computed(() => `/${DIR_TO_SLUG[deal.value?.direction ?? props.direction]}`)
const headerCrumb = computed(() => {
  const d = deal.value?.direction ?? props.direction
  const dirLabel = d === 'procurement' ? t('pipeline.direction.procurement') : t('pipeline.direction.sales')
  return `${t('nav.workspace')} / ${dirLabel}`
})
</script>

<template>
  <div v-if="deal" class="page-deal-detail">
    <NuxtLink :to="backHref" class="back">
      <UIcon name="i-lucide-arrow-left" class="size-3.5" />
      <span class="mono">{{ deal.direction === 'procurement' ? $t('pipeline.direction.procurement') : $t('pipeline.direction.sales') }}</span>
    </NuxtLink>

    <header class="page-deal-detail__head">
      <div class="page-deal-detail__avatar" aria-hidden="true">{{ initials }}</div>
      <div class="page-deal-detail__meta">
        <div class="eyebrow">{{ headerCrumb }}</div>
        <h1 class="page-deal-detail__name">{{ deal.customer_name || deal.name }}</h1>
        <div class="page-deal-detail__meta-row mono">
          <span>{{ STAGE_LABEL[deal.stage] }}</span>
          <span v-if="deal.value_rappen > 0">· CHF {{ chf(deal.value_rappen) }}</span>
          <span v-if="deal.due_date">· {{ dateCh(deal.due_date) }}</span>
        </div>
      </div>
      <div class="page-deal-detail__actions">
        <a v-if="resolvedEmail" class="ed-btn" :href="`mailto:${resolvedEmail}`">
          <UIcon name="i-lucide-mail" class="size-3.5" />
          {{ resolvedEmail }}
        </a>
        <button class="ed-btn-primary" type="button" @click="openCompose">
          <UIcon name="i-lucide-send" class="size-3.5" />
          {{ $t('pipeline.detail.compose') }}
        </button>
      </div>
    </header>

    <div class="page-deal-detail__grid">
      <UiCard>
        <h3 class="eyebrow">{{ subscribeWord }}</h3>
        <dl class="page-deal-detail__dl">
          <div class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.dealName') }}</dt>
            <dd>{{ deal.name }}</dd>
          </div>
          <div v-if="resolvedEmail" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('customers.email') }}</dt>
            <dd>{{ resolvedEmail }}</dd>
          </div>
          <div v-if="resolvedPhone" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('customers.phone') }}</dt>
            <dd class="mono">{{ resolvedPhone }}</dd>
          </div>
          <div v-if="deal.label" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.label') }}</dt>
            <dd>{{ deal.label }}</dd>
          </div>
          <div v-if="deal.value_rappen > 0" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.value') }}</dt>
            <dd class="mono">CHF {{ chf(deal.value_rappen) }}</dd>
          </div>
        </dl>

        <hr class="page-deal-detail__sep">

        <h3 class="eyebrow">{{ $t('pipeline.stage.label') }}</h3>
        <div class="page-deal-detail__stage-row">
          <USelect :model-value="deal.stage" :items="stageOptions" class="w-full" @update:model-value="changeStage" />
        </div>

        <hr class="page-deal-detail__sep">

        <h3 class="eyebrow">{{ $t('common.notes') }}</h3>
        <p v-if="deal.notes" class="page-deal-detail__notes">{{ deal.notes }}</p>
        <p v-else class="page-deal-detail__notes muted">{{ $t('pipeline.detail.noNotes') }}</p>
      </UiCard>

      <UiCard>
        <div class="page-deal-detail__timeline-head">
          <h3 class="eyebrow">{{ $t('pipeline.detail.timeline') }}</h3>
          <button class="ed-btn-ghost ed-btn-sm" type="button" @click="openLogReply">
            <UIcon name="i-lucide-message-square-plus" class="size-3.5" />
            {{ $t('pipeline.detail.logReply') }}
          </button>
        </div>

        <EmptyState
          v-if="!emails.rows.length"
          :bordered="false"
          icon="i-lucide-inbox"
          :title="$t('pipeline.detail.emptyTitle')"
          :description="$t('pipeline.detail.emptyText')"
        />
        <ul v-else class="page-deal-detail__thread">
          <li
            v-for="ev in emails.rows"
            :key="ev.id"
            class="email-msg"
            :class="`is-${ev.direction}`"
          >
            <header class="email-msg__head">
              <span class="mono email-msg__dir">{{ ev.direction === 'outbound' ? $t('pipeline.detail.sent') : $t('pipeline.detail.received') }}</span>
              <span class="mono email-msg__time">{{ fmtTimestamp(ev.sent_at) }}</span>
            </header>
            <h4 class="email-msg__subject">{{ ev.subject || '(no subject)' }}</h4>
            <div v-if="ev.body_html" class="email-msg__body" v-html="sanitizeHtml(ev.body_html)" />
            <pre v-else-if="ev.body_text" class="email-msg__body email-msg__body--text">{{ ev.body_text }}</pre>
            <footer v-if="ev.from_address || ev.to_address" class="email-msg__foot mono">
              <span v-if="ev.direction === 'outbound' && ev.to_address">→ {{ ev.to_address }}</span>
              <span v-else-if="ev.direction === 'inbound' && ev.from_address">← {{ ev.from_address }}</span>
            </footer>
          </li>
        </ul>
      </UiCard>
    </div>

    <USlideover
      v-model:open="composer.open"
      :title="$t('pipeline.detail.compose')"
      :ui="{ content: 'max-w-full sm:max-w-2xl' }"
    >
      <template #body>
        <form novalidate class="flex flex-col gap-4" @submit.prevent="send">
          <UFormField :label="$t('pipeline.detail.to')" :error="composerError">
            <UInput v-model="composer.to" inputmode="email" autocomplete="email" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.detail.subject')">
            <UInput v-model="composer.subject" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.detail.message')">
            <ClientOnly>
              <UEditor
                v-model="composer.body_html"
                content-type="html"
                :extensions="emailEditorExtensions"
                :handlers="emailEditorHandlers"
                class="email-editor email-editor--tall"
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
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button class="ed-btn-ghost" type="button" @click="composer.open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" type="button" :disabled="sending" @click="send">
            <UIcon name="i-lucide-send" class="size-3.5" />
            {{ $t('pipeline.detail.send') }}
          </button>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="reply.open" :title="$t('pipeline.detail.logReply')">
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField :label="$t('pipeline.detail.from')" :error="replyError">
            <UInput v-model="reply.from" inputmode="email" autocomplete="email" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.detail.subject')">
            <UInput v-model="reply.subject" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.detail.message')">
            <UTextarea v-model="reply.body_text" :rows="6" autoresize class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button class="ed-btn-ghost" type="button" @click="reply.open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" type="button" :disabled="logging" @click="logReply">{{ $t('pipeline.detail.logSave') }}</button>
        </div>
      </template>
    </UModal>
  </div>
</template>
