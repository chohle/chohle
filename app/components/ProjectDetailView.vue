<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

type Direction = 'sales' | 'procurement'
type Stage =
  | 'lead'
  | 'contacted'
  | 'proposal'
  | 'won'
  | 'active'
  | 'completed'
  | 'need'
  | 'requested'
  | 'received'
  | 'accepted'

interface ProjectDetail {
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
  budget_rappen: number
  budget_type: string
  due_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface ProjectEmail {
  id: number
  project_id: number
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

const DIR_TO_SLUG: Record<Direction, string> = { sales: 'sales', procurement: 'procurement' }
// Detail page exposes the full lifecycle so the user can move a project into
// 'active' (work in flight) or 'completed' (archived) after winning it.
const SALES_STAGES: Stage[] = ['lead', 'contacted', 'proposal', 'won', 'active', 'completed']
const PROC_STAGES: Stage[] = ['need', 'requested', 'received', 'accepted']

const { t } = useI18n()
const toast = useToast()

const { data: project, refresh: refreshProject } = await useFetch<ProjectDetail>(
  `/api/projects/${props.id}`
)
const { data: emails, refresh: refreshEmails } = await useFetch<{ rows: ProjectEmail[] }>(
  `/api/projects/${props.id}/emails`,
  {
    default: () => ({ rows: [] })
  }
)

interface ProjectInvoiceRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  due_date: string
  total_rappen: number
}
const { data: invoices } = await useFetch<ProjectInvoiceRow[]>(
  `/api/projects/${props.id}/invoices`,
  {
    default: () => []
  }
)

interface ProjectQuoteRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  issue_date: string
  valid_until: string | null
  converted_invoice_id: number | null
  total_rappen: number
}
const { data: quotes } = await useFetch<ProjectQuoteRow[]>(`/api/projects/${props.id}/quotes`, {
  default: () => []
})

// Budget burn: paid is locked in, sent is committed (awaiting payment), draft
// hasn't been issued yet. Show them separately so the user can read both
// "what we've billed" and "what's actually landed".
const burn = computed(() => {
  const list = invoices.value ?? []
  const paid = list.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total_rappen, 0)
  const sent = list.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total_rappen, 0)
  const draft = list.filter((i) => i.status === 'draft').reduce((s, i) => s + i.total_rappen, 0)
  const invoiced = paid + sent + draft
  const budget = project.value?.budget_rappen ?? 0
  const remaining = Math.max(budget - invoiced, 0)
  const pct = budget > 0 ? Math.min(100, Math.round((invoiced / budget) * 100)) : 0
  return { paid, sent, draft, invoiced, budget, remaining, pct }
})

const archiving = ref(false)
async function archive() {
  if (!project.value) return
  archiving.value = true
  try {
    await $fetch(`/api/projects/${props.id}`, { method: 'PUT', body: { stage: 'completed' } })
    await refreshProject()
    toast.add({ title: t('pipeline.detail.archived'), color: 'success' })
  } finally {
    archiving.value = false
  }
}

const creatingInvoice = ref(false)
async function newInvoice() {
  if (!project.value) return
  creatingInvoice.value = true
  try {
    const { id: invoiceId } = await $fetch<{ id: number }>(`/api/projects/${props.id}/invoices`, {
      method: 'POST'
    })
    await navigateTo(`/invoices/${invoiceId}`)
  } catch (err) {
    const msg =
      (err as { statusMessage?: string }).statusMessage ?? t('pipeline.detail.invoiceFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    creatingInvoice.value = false
  }
}

const creatingQuote = ref(false)
async function newQuote() {
  if (!project.value) return
  creatingQuote.value = true
  try {
    const { id: quoteId } = await $fetch<{ id: number }>(`/api/projects/${props.id}/quotes`, {
      method: 'POST'
    })
    await navigateTo(`/quotes/${quoteId}`)
  } catch (err) {
    const msg =
      (err as { statusMessage?: string }).statusMessage ?? t('pipeline.detail.quoteFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    creatingQuote.value = false
  }
}

// Bounce to the correct slug if the URL direction doesn't match the project's.
if (project.value && project.value.direction !== props.direction) {
  await navigateTo(`/${DIR_TO_SLUG[project.value.direction]}/${project.value.id}`, {
    replace: true
  })
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
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
  active: t('pipeline.stage.active'),
  completed: t('pipeline.stage.completed'),
  need: t('pipeline.stage.need'),
  requested: t('pipeline.stage.requested'),
  received: t('pipeline.stage.received'),
  accepted: t('pipeline.stage.accepted')
}))

const stageOptions = computed(() => {
  if (!project.value) return []
  const stages = project.value.direction === 'procurement' ? PROC_STAGES : SALES_STAGES
  return stages.map((s) => ({ value: s, label: STAGE_LABEL.value[s] }))
})

async function changeStage(newStage: Stage) {
  if (!project.value || project.value.stage === newStage) return
  await $fetch(`/api/projects/${props.id}`, {
    method: 'PUT',
    body: { stage: newStage }
  })
  await refreshProject()
}

// Basic RFC-ish check, good enough to catch typos like "aadsf" without
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
  if (!v) {
    composerError.value = t('validation.required')
    return false
  }
  if (!EMAIL_RE.test(v)) {
    composerError.value = t('validation.email')
    return false
  }
  composerError.value = ''
  return true
}
watch(
  () => composer.to,
  () => {
    if (composerError.value) validateComposerTo()
  }
)

// Resolve contact via the API's COALESCEd value first, then the raw project
// fields. Belt and braces: handles edge cases where the linked customer has
// an empty string email but the project has its own inline one.
const resolvedEmail = computed(() => project.value?.customer_email || project.value?.email || '')
const resolvedPhone = computed(() => project.value?.customer_phone || project.value?.phone || '')

function openCompose() {
  composer.open = true
  composer.to = resolvedEmail.value
  composer.subject = ''
  composer.body_html = ''
  composerError.value = ''
}

// Group the flat thread into per-subject conversations so replies sit under
// the email they answer, and a fresh subject starts a new block.
const emailGroups = computed(() => groupEmailsBySubject(emails.value.rows))

// Prefix a subject with "Re:" for a reply, without stacking on an existing one.
function reSubject(subject: string | null) {
  const s = (subject ?? '').trim()
  if (!s) return 'Re:'
  return /^re:\s*/i.test(s) ? s : `Re: ${s}`
}

// Reply to a specific message: open the composer addressed to the other party
// on that message, with a "Re:" subject. The body is left blank to type into.
function replyTo(ev: ProjectEmail) {
  composer.open = true
  composer.to =
    (ev.direction === 'inbound' ? ev.from_address : ev.to_address) || resolvedEmail.value
  composer.subject = reSubject(ev.subject)
  composer.body_html = ''
  composerError.value = ''
}

// Deep link from the Conversations page (?reply=<emailId>) opens the composer
// pre-filled for that message once the thread has loaded.
const route = useRoute()
onMounted(() => {
  const replyId = Number(route.query.reply)
  if (!Number.isFinite(replyId) || replyId <= 0) return
  const target = emails.value.rows.find((e) => e.id === replyId)
  if (target) replyTo(target)
})

async function send() {
  if (!validateComposerTo()) return
  if (!composer.subject.trim() || !composer.body_html.trim()) return
  sending.value = true
  try {
    await $fetch(`/api/projects/${props.id}/emails`, {
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
    const msg =
      (err as { statusMessage?: string }).statusMessage ?? t('pipeline.detail.emailFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    sending.value = false
  }
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

// Reply From is optional (you may not know the sender for a verbal or phone
// log), but if provided, it has to look like an email.
function validateReplyFrom(): boolean {
  const v = reply.from.trim()
  if (v && !EMAIL_RE.test(v)) {
    replyError.value = t('validation.email')
    return false
  }
  replyError.value = ''
  return true
}
watch(
  () => reply.from,
  () => {
    if (replyError.value) validateReplyFrom()
  }
)

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
    await $fetch(`/api/projects/${props.id}/emails/log`, {
      method: 'POST',
      body: {
        subject: reply.subject.trim(),
        from: reply.from.trim() || null,
        body_text: reply.body_text
      }
    })
    reply.open = false
    await refreshEmails()
  } finally {
    logging.value = false
  }
}

const initials = computed(() => {
  const n = project.value?.customer_name || project.value?.name || ''
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
})

const subscribeWord = computed(() =>
  project.value?.direction === 'procurement'
    ? t('pipeline.detail.supplier')
    : t('pipeline.detail.contact')
)

// Back goes to the customer when there is one (project belongs to a
// customer record), otherwise falls back to the pipeline column the user
// most likely came from.
const back = computed(() => {
  if (project.value?.customer_id) {
    return {
      href: `/customers/${project.value.customer_id}`,
      label: project.value.customer_name || t('customers.colCustomer')
    }
  }
  const dir = project.value?.direction ?? props.direction
  const dirLabel =
    dir === 'procurement' ? t('pipeline.direction.procurement') : t('pipeline.direction.sales')
  return { href: `/${DIR_TO_SLUG[dir]}`, label: dirLabel }
})
const headerCrumb = computed(() => {
  const d = project.value?.direction ?? props.direction
  const dirLabel =
    d === 'procurement' ? t('pipeline.direction.procurement') : t('pipeline.direction.sales')
  return `${t('nav.workspace')} / ${dirLabel}`
})
</script>

<template>
  <div v-if="project" class="page-deal-detail">
    <NuxtLink :to="back.href" class="back">
      <UIcon name="i-lucide-arrow-left" class="size-3.5" />
      <span class="mono">{{ back.label }}</span>
    </NuxtLink>

    <header class="page-deal-detail__head">
      <div class="page-deal-detail__avatar" aria-hidden="true">{{ initials }}</div>
      <div class="page-deal-detail__meta">
        <div class="eyebrow">{{ headerCrumb }}</div>
        <h1 class="page-deal-detail__name">{{ project.customer_name || project.name }}</h1>
        <div class="page-deal-detail__meta-row mono">
          <span>{{ STAGE_LABEL[project.stage] }}</span>
          <span v-if="project.budget_rappen > 0">· CHF {{ chf(project.budget_rappen) }}</span>
          <span v-if="project.due_date">· {{ dateCh(project.due_date) }}</span>
        </div>
      </div>
      <div class="page-deal-detail__actions">
        <a v-if="resolvedEmail" class="ed-btn" :href="`mailto:${resolvedEmail}`">
          <UIcon name="i-lucide-mail" class="size-3.5" />
          {{ resolvedEmail }}
        </a>
        <button class="ed-btn" type="button" @click="openCompose">
          <UIcon name="i-lucide-send" class="size-3.5" />
          {{ $t('pipeline.detail.compose') }}
        </button>
        <button
          v-if="project.direction === 'sales' && project.stage !== 'completed'"
          class="ed-btn"
          type="button"
          :disabled="archiving"
          @click="archive"
        >
          <UIcon name="i-lucide-archive" class="size-3.5" />
          {{ $t('pipeline.detail.archive') }}
        </button>
        <button
          v-if="project.direction === 'sales'"
          class="ed-btn-primary"
          type="button"
          :disabled="creatingInvoice || !project.customer_id"
          :title="!project.customer_id ? $t('pipeline.detail.linkCustomerFirst') : ''"
          @click="newInvoice"
        >
          <UIcon name="i-lucide-file-text" class="size-3.5" />
          {{ $t('pipeline.detail.newInvoice') }}
        </button>
      </div>
    </header>

    <section
      v-if="project.direction === 'sales' && project.budget_rappen > 0"
      class="page-deal-detail__burn"
    >
      <UiCard>
        <h3 class="eyebrow">{{ $t('pipeline.detail.budgetBurn') }}</h3>
        <div class="page-deal-detail__burn-bar" :aria-label="`${burn.pct}%`">
          <div class="page-deal-detail__burn-fill" :style="{ width: `${burn.pct}%` }" />
        </div>
        <div class="page-deal-detail__burn-stats mono">
          <span
            >{{ $t('pipeline.detail.invoiced') }}:
            <b class="tabular">CHF {{ chf(burn.invoiced) }}</b></span
          >
          <span
            >{{ $t('pipeline.detail.paid') }}: <b class="tabular">CHF {{ chf(burn.paid) }}</b></span
          >
          <span
            >{{ $t('pipeline.detail.remaining') }}:
            <b class="tabular">CHF {{ chf(burn.remaining) }}</b></span
          >
          <span
            >{{ $t('pipeline.detail.budgetTotal') }}:
            <b class="tabular">CHF {{ chf(burn.budget) }}</b></span
          >
        </div>
      </UiCard>
    </section>

    <div class="page-deal-detail__grid">
      <UiCard>
        <h3 class="eyebrow">{{ subscribeWord }}</h3>
        <dl class="page-deal-detail__dl">
          <div class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.projectName') }}</dt>
            <dd>{{ project.name }}</dd>
          </div>
          <div v-if="resolvedEmail" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('customers.email') }}</dt>
            <dd>{{ resolvedEmail }}</dd>
          </div>
          <div v-if="resolvedPhone" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('customers.phone') }}</dt>
            <dd class="mono">{{ resolvedPhone }}</dd>
          </div>
          <div v-if="project.label" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.label') }}</dt>
            <dd>{{ project.label }}</dd>
          </div>
          <div v-if="project.budget_rappen > 0" class="page-deal-detail__dl-item">
            <dt class="eyebrow">{{ $t('pipeline.budget') }}</dt>
            <dd class="mono">CHF {{ chf(project.budget_rappen) }}</dd>
          </div>
        </dl>

        <hr class="page-deal-detail__sep" />

        <h3 class="eyebrow">{{ $t('pipeline.stage.label') }}</h3>
        <div class="page-deal-detail__stage-row">
          <USelect
            :model-value="project.stage"
            :items="stageOptions"
            class="w-full"
            @update:model-value="changeStage"
          />
        </div>

        <hr class="page-deal-detail__sep" />

        <h3 class="eyebrow">{{ $t('common.notes') }}</h3>
        <p v-if="project.notes" class="page-deal-detail__notes">{{ project.notes }}</p>
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
        <div v-else class="email-groups">
          <section v-for="g in emailGroups" :key="g.key" class="email-group">
            <header class="email-group__head">
              <h4 class="email-group__subject">{{ g.subject || $t('conversations.noSubject') }}</h4>
              <span class="email-group__count mono"
                >{{ g.messages.length }} {{ $t('conversations.messages') }}</span
              >
            </header>
            <ul class="email-group__list">
              <li
                v-for="ev in g.messages"
                :key="ev.id"
                class="email-msg"
                :class="`is-${ev.direction}`"
              >
                <header class="email-msg__head">
                  <span class="mono email-msg__dir">{{
                    ev.direction === 'outbound'
                      ? $t('pipeline.detail.sent')
                      : $t('pipeline.detail.received')
                  }}</span>
                  <span class="mono email-msg__time">{{ fmtTimestamp(ev.sent_at) }}</span>
                </header>
                <h4 class="email-msg__subject">{{ ev.subject || '(no subject)' }}</h4>
                <div
                  v-if="ev.body_html"
                  class="email-msg__body"
                  v-html="sanitizeHtml(ev.body_html)"
                />
                <pre v-else-if="ev.body_text" class="email-msg__body email-msg__body--text">{{
                  ev.body_text
                }}</pre>
                <footer
                  v-if="ev.from_address || ev.to_address || ev.direction === 'inbound'"
                  class="email-msg__foot mono"
                >
                  <span v-if="ev.direction === 'outbound' && ev.to_address"
                    >→ {{ ev.to_address }}</span
                  >
                  <span v-else-if="ev.direction === 'inbound' && ev.from_address"
                    >← {{ ev.from_address }}</span
                  >
                  <button
                    v-if="ev.direction === 'inbound'"
                    type="button"
                    class="email-msg__reply"
                    @click="replyTo(ev)"
                  >
                    <UIcon name="i-lucide-reply" class="size-3.5" />
                    {{ $t('pipeline.detail.reply') }}
                  </button>
                </footer>
              </li>
            </ul>
          </section>
        </div>
      </UiCard>
    </div>

    <section v-if="project.direction === 'sales'" class="page-deal-detail__invoices">
      <UiCard>
        <div class="page-deal-detail__timeline-head">
          <h3 class="eyebrow">{{ $t('pipeline.detail.quotesTitle') }}</h3>
          <button
            class="ed-btn-ghost ed-btn-sm"
            type="button"
            :disabled="creatingQuote || !project.customer_id"
            @click="newQuote"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            {{ $t('pipeline.detail.newQuote') }}
          </button>
        </div>

        <EmptyState
          v-if="!quotes.length"
          :bordered="false"
          icon="i-lucide-file-pen"
          :title="$t('pipeline.detail.noQuotesTitle')"
          :description="$t('pipeline.detail.noQuotesText')"
        />
        <div v-else class="ed-scroll">
          <table class="ed-table">
            <thead>
              <tr>
                <th>{{ $t('quotes.number') }}</th>
                <th>{{ $t('common.title') }}</th>
                <th>{{ $t('quotes.statusLabel') }}</th>
                <th>{{ $t('quotes.issueDate') }}</th>
                <th>{{ $t('quotes.validUntil') }}</th>
                <th class="right">{{ $t('common.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="q in quotes"
                :key="q.id"
                class="row"
                tabindex="0"
                role="button"
                :aria-label="`${q.number || $t('common.untitled')} ${q.title || ''}`.trim()"
                @click="navigateTo(`/quotes/${q.id}`)"
                @keyup.enter="navigateTo(`/quotes/${q.id}`)"
                @keyup.space.prevent="navigateTo(`/quotes/${q.id}`)"
              >
                <td class="mono">{{ q.number || '—' }}</td>
                <td>{{ q.title || '—' }}</td>
                <td class="mono">{{ $t(`status.${q.status}`) }}</td>
                <td class="mono">{{ dateCh(q.issue_date) }}</td>
                <td class="mono">{{ q.valid_until ? dateCh(q.valid_until) : '—' }}</td>
                <td class="right mono">CHF {{ chf(q.total_rappen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
      <UiCard class="mt-4">
        <div class="page-deal-detail__timeline-head">
          <h3 class="eyebrow">{{ $t('pipeline.detail.invoicesTitle') }}</h3>
          <button
            class="ed-btn-ghost ed-btn-sm"
            type="button"
            :disabled="creatingInvoice || !project.customer_id"
            @click="newInvoice"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            {{ $t('pipeline.detail.newInvoice') }}
          </button>
        </div>

        <EmptyState
          v-if="!invoices.length"
          :bordered="false"
          icon="i-lucide-file-text"
          :title="$t('pipeline.detail.noInvoicesTitle')"
          :description="$t('pipeline.detail.noInvoicesText')"
        />
        <div v-else class="ed-scroll">
          <table class="ed-table">
            <thead>
              <tr>
                <th>{{ $t('invoices.number') }}</th>
                <th>{{ $t('common.title') }}</th>
                <th>{{ $t('invoices.statusLabel') }}</th>
                <th>{{ $t('invoices.issueDate') }}</th>
                <th class="right">{{ $t('common.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in invoices"
                :key="inv.id"
                class="row"
                tabindex="0"
                role="button"
                :aria-label="`${inv.number || $t('common.untitled')} ${inv.title || ''}`.trim()"
                @click="navigateTo(`/invoices/${inv.id}`)"
                @keyup.enter="navigateTo(`/invoices/${inv.id}`)"
                @keyup.space.prevent="navigateTo(`/invoices/${inv.id}`)"
              >
                <td class="mono">{{ inv.number || '—' }}</td>
                <td>{{ inv.title || '—' }}</td>
                <td class="mono">{{ $t(`status.${inv.status}`) }}</td>
                <td class="mono">{{ dateCh(inv.issue_date) }}</td>
                <td class="right mono">CHF {{ chf(inv.total_rappen) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
    </section>

    <USlideover
      v-model:open="composer.open"
      :title="$t('pipeline.detail.compose')"
      :ui="{ content: 'max-w-full sm:max-w-2xl' }"
    >
      <template #body>
        <form novalidate class="flex flex-col gap-4" @submit.prevent="send">
          <UFormField :label="$t('pipeline.detail.to')" :error="composerError || undefined">
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
                  <UEditorToolbar
                    :editor="editor"
                    :items="emailEditorItems"
                    class="email-editor__toolbar flex-wrap"
                  >
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
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" type="button" @click="composer.open = false">
            {{ $t('common.cancel') }}
          </button>
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
          <UFormField :label="$t('pipeline.detail.from')" :error="replyError || undefined">
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
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" type="button" @click="reply.open = false">
            {{ $t('common.cancel') }}
          </button>
          <button class="ed-btn-primary" type="button" :disabled="logging" @click="logReply">
            {{ $t('pipeline.detail.logSave') }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>
