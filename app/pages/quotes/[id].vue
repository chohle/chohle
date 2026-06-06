<script setup lang="ts">
interface QuoteRow {
  customer_id: number
  project_id: number | null
  number: string
  title: string
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  issue_date: string
  valid_until: string | null
  accepted_at: string | null
  declined_at: string | null
  converted_invoice_id: number | null
}
interface ProjectMini {
  id: number
  name: string
  direction: 'sales' | 'procurement'
}
interface ItemRow {
  article_id: number | null
  article_name: string
  description: string
  quantity: number
  unit: string
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
}
interface RefRow {
  id?: number
  label: string
  url: string
}
interface Article {
  id: number
  name: string
  unit: string
  default_price_rappen: number
  default_mwst: number
}

const { t, loadLocaleMessages } = useI18n()
const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const { data, refresh } = await useFetch<{
  quote: QuoteRow
  items: ItemRow[]
  references: RefRow[]
  project: ProjectMini | null
  convertedInvoice: { id: number; number: string } | null
}>(`/api/quotes/${id}`)
// Snapshot only for one-shot script reads (customerId, header form).
// The template reads the live `q` computed below so timestamps stay in
// sync after accept/decline refresh.
const initialQuote = data.value!.quote
const linkedProject = ref<ProjectMini | null>(data.value!.project)
const convertedInvoice = ref<{ id: number; number: string } | null>(data.value!.convertedInvoice)
const customerId = initialQuote.customer_id
const q = computed(() => data.value!.quote)

const { data: globalArticles } = await useFetch<Article[]>('/api/articles', {
  default: () => []
})
const { data: customerArticles } = await useFetch<Article[]>(
  `/api/customers/${customerId}/articles`,
  { default: () => [] }
)
const { data: sender } = await useFetch<{
  vat_registered: number
  name: string
  email_template: string
}>('/api/sender')
const { data: customer } = await useFetch<{
  name: string
  email: string | null
  language: string
}>(`/api/customers/${customerId}`)

// Customer-language i18n loader so the email defaults render in the
// language the customer reads, not the owner's UI language.
const custLocale = (customer.value?.language ?? 'en') as Parameters<typeof loadLocaleMessages>[0]
await loadLocaleMessages(custLocale)
const td = (key: string, named?: Record<string, unknown>) =>
  t(key, named ?? {}, { locale: custLocale })

const vat = computed(() => !!sender.value?.vat_registered)
const articles = computed(() => [...globalArticles.value, ...customerArticles.value])

// Projects of the same customer so the user can relink without leaving.
const { data: customerProjects } = await useFetch<ProjectMini[]>(
  `/api/customers/${customerId}/projects`,
  { default: () => [] }
)
const projectOptions = computed(() => [
  { label: t('quotes.noProject'), value: null as number | null },
  ...(customerProjects.value ?? []).map((p) => ({ label: p.name, value: p.id }))
])

const header = reactive({
  number: initialQuote.number,
  title: initialQuote.title,
  status: initialQuote.status,
  issueDate: initialQuote.issue_date,
  validUntil: initialQuote.valid_until ?? '',
  projectId: initialQuote.project_id as number | null
})

interface EditRow {
  articleId: number | null
  articleName: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPercent: number
  mwstPercent: number
}
const items = ref<EditRow[]>(
  data.value!.items.map((i) => ({
    articleId: i.article_id,
    articleName: i.article_name ?? '',
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: i.unit_price_rappen / 100,
    discountPercent: i.discount_percent,
    mwstPercent: i.mwst_percent
  }))
)
// Article names as native datalist suggestions for the free-text article field.
const articleNames = computed(() => articles.value.map((a) => a.name))

// When the typed article name exactly matches a saved article, remember the id
// and autofill unit/price/VAT — but only the fields the user hasn't filled, so
// a free-typed line is never clobbered.
function onArticleName(row: EditRow) {
  const name = row.articleName.trim()
  const a = articles.value.find((x) => x.name.toLowerCase() === name.toLowerCase())
  row.articleId = a?.id ?? null
  if (!a) return
  if (!row.unit) row.unit = a.unit
  if (!row.unitPrice) row.unitPrice = a.default_price_rappen / 100
  if (vat.value && (!row.mwstPercent || row.mwstPercent === 8.1)) row.mwstPercent = a.default_mwst
}
function addRow() {
  items.value.push({
    articleId: null,
    articleName: '',
    description: '',
    quantity: 1,
    unit: '',
    unitPrice: 0,
    discountPercent: 0,
    mwstPercent: 8.1
  })
}

// --- reference / example links -----------------------------------------------
const references = ref<RefRow[]>((data.value!.references ?? []).map((r) => ({ ...r })))
function addRef() {
  references.value.push({ label: '', url: '' })
}
function removeRef(i: number) {
  references.value.splice(i, 1)
}
function removeRow(i: number) {
  items.value.splice(i, 1)
}
function toLine(r: EditRow) {
  return {
    quantity: r.quantity || 0,
    unitPriceRappen: Math.round((r.unitPrice || 0) * 100),
    discountPercent: r.discountPercent || 0,
    mwstPercent: r.mwstPercent || 0
  }
}
const totals = computed(() => computeInvoiceTotals(items.value.map(toLine), vat.value))
function lineAmount(r: EditRow) {
  return lineNetRappen(toLine(r))
}

const saving = ref(false)
const confirmDelete = ref(false)

function snapshot() {
  return JSON.stringify({ ...header, items: items.value, references: references.value })
}
const baseline = ref(snapshot())
const dirty = computed(() => snapshot() !== baseline.value)

const showLeaveDialog = ref(false)
let resolveLeave: ((v: boolean) => void) | null = null
function confirmLeave(): Promise<boolean> {
  resolveLeave?.(false)
  return new Promise((res) => {
    resolveLeave = res
    showLeaveDialog.value = true
  })
}
function answerLeave(v: boolean) {
  showLeaveDialog.value = false
  resolveLeave?.(v)
  resolveLeave = null
}
useDirtyGuard(() => dirty.value, confirmLeave)

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/quotes/${id}`, {
      method: 'PUT',
      body: {
        ...header,
        validUntil: header.validUntil || null,
        items: items.value,
        references: references.value
      }
    })
    baseline.value = snapshot()
    toast.add({ title: t('quotes.savedToast'), color: 'success' })
  } finally {
    saving.value = false
  }
}
async function removeQuote() {
  await $fetch(`/api/quotes/${id}`, { method: 'DELETE' })
  baseline.value = snapshot()
  toast.add({ title: t('quotes.deletedToast'), color: 'success' })
  await navigateTo('/quotes')
}
async function markAccepted() {
  await $fetch(`/api/quotes/${id}/accept`, { method: 'POST' })
  toast.add({ title: t('quotes.acceptedToast'), color: 'success' })
  await refresh()
  if (data.value) {
    header.status = data.value.quote.status
  }
}
async function markDeclined() {
  await $fetch(`/api/quotes/${id}/decline`, { method: 'POST' })
  toast.add({ title: t('quotes.declinedToast'), color: 'success' })
  await refresh()
  if (data.value) {
    header.status = data.value.quote.status
  }
}
async function convertToInvoice() {
  try {
    const r = await $fetch<{ invoiceId: number }>(`/api/quotes/${id}/convert-to-invoice`, {
      method: 'POST'
    })
    toast.add({
      title: t('quotes.convertedToast', { number: '#' + r.invoiceId }),
      color: 'success'
    })
    await navigateTo(`/invoices/${r.invoiceId}`)
  } catch (e) {
    toast.add({
      title: t('quotes.convertFailed'),
      description: (e as { statusMessage?: string }).statusMessage,
      color: 'error'
    })
  }
}

// Send modal
const sendOpen = ref(false)
const subjectOverride = ref<string | null>(null)
const messageOverride = ref<string | null>(null)
const emailSubject = computed({
  get: () =>
    subjectOverride.value ?? td('quotes.defaultSubject', { number: header.number || '#' + id }),
  set: (v: string) => {
    subjectOverride.value = v
  }
})
// Compose the default email body from three plain text i18n keys.
// HTML cannot live inside i18n locale files because unplugin-vue-i18n
// strict-checks messages for HTML and aborts the build, taking every
// locale down with it. Same shape as the invoice editor, which sources
// its HTML template from the DB (sender.email_template) rather than
// i18n; quotes will move to a DB-stored template once Settings grows
// a Quote template editor.
function escHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
function defaultBody(): string {
  // Escape every interpolated value before it lands in the HTML body. A
  // legitimate '&' in a company name or a stray '<' in a quote number
  // would otherwise corrupt the rendered preview (or, in theory, run
  // injected markup if someone typed it into their own customer record).
  const safeCustomer = escHtml(customer.value?.name ?? '')
  const safeNumber = escHtml(header.number || '#' + id)
  const safeSender = escHtml(sender.value?.name ?? '')
  const greeting = td('quotes.defaultGreeting', { customer: safeCustomer })
  const body = td('quotes.defaultBody', { number: safeNumber })
  const signoff = td('quotes.defaultSignoff')
  return `<p>${greeting}</p><p>${body}</p><p>${signoff}<br>${safeSender}</p>`
}
const emailMessage = computed({
  get: () => messageOverride.value ?? defaultBody(),
  set: (v: string) => {
    messageOverride.value = v
  }
})

// Signature picker + write/preview toggle for the send modal.
const { signatures, defaultSignatureId, signatureItems } = useSignatures()
const signatureId = ref<number | null>(null)
watch(
  defaultSignatureId,
  (v) => {
    if (signatureId.value === null) signatureId.value = v
  },
  {
    immediate: true
  }
)
const sendPreview = ref(false)

async function openSend() {
  await save()
  sendPreview.value = false
  sendOpen.value = true
}
async function sendQuote() {
  saving.value = true
  try {
    await $fetch(`/api/quotes/${id}/send`, {
      method: 'POST',
      body: {
        subject: emailSubject.value,
        message: emailMessage.value,
        signature_id: signatureId.value ?? undefined
      }
    })
    header.status = 'sent'
    baseline.value = snapshot()
    sendOpen.value = false
    toast.add({ title: t('quotes.sentToast'), color: 'success' })
  } catch (e) {
    toast.add({
      title: t('quotes.sendFailed'),
      description: (e as { statusMessage?: string }).statusMessage,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

// --- attached documents ------------------------------------------------------
// Rich documents written in-app, rendered to PDF and attached when the quote is
// emailed (see server/utils/documentPdf.ts).
interface QuoteDoc {
  id: number
  title: string
  content: Record<string, unknown>
  attach: number
  updated_at: string
}
const { data: docsData, refresh: refreshDocs } = await useFetch<{ documents: QuoteDoc[] }>(
  `/api/quotes/${id}/documents`,
  { default: () => ({ documents: [] }) }
)
const documents = computed(() => docsData.value.documents)

const docEditor = reactive<{
  open: boolean
  id: number | null
  title: string
  content: Record<string, unknown>
  saving: boolean
}>({ open: false, id: null, title: '', content: { type: 'doc', content: [] }, saving: false })

function openNewDoc() {
  docEditor.id = null
  docEditor.title = ''
  docEditor.content = { type: 'doc', content: [] }
  docEditor.open = true
}
function openDoc(d: QuoteDoc) {
  docEditor.id = d.id
  docEditor.title = d.title
  docEditor.content = d.content ?? { type: 'doc', content: [] }
  docEditor.open = true
}
async function saveDoc() {
  if (!docEditor.title.trim()) {
    toast.add({ title: t('quotes.docTitleRequired'), color: 'error' })
    return
  }
  docEditor.saving = true
  try {
    if (docEditor.id) {
      await $fetch(`/api/quotes/${id}/documents/${docEditor.id}`, {
        method: 'PUT',
        body: { title: docEditor.title.trim(), content: docEditor.content }
      })
    } else {
      const { id: newId } = await $fetch<{ id: number }>(`/api/quotes/${id}/documents`, {
        method: 'POST',
        body: { title: docEditor.title.trim() }
      })
      await $fetch(`/api/quotes/${id}/documents/${newId}`, {
        method: 'PUT',
        body: { content: docEditor.content }
      })
    }
    await refreshDocs()
    docEditor.open = false
    toast.add({ title: t('quotes.docSaved'), color: 'success' })
  } finally {
    docEditor.saving = false
  }
}
async function deleteDoc(d: QuoteDoc) {
  await $fetch(`/api/quotes/${id}/documents/${d.id}`, { method: 'DELETE' })
  await refreshDocs()
}
async function toggleAttach(d: QuoteDoc, value: boolean) {
  await $fetch(`/api/quotes/${id}/documents/${d.id}`, { method: 'PUT', body: { attach: value } })
  await refreshDocs()
}
function previewDoc(d: QuoteDoc) {
  window.open(`/api/quotes/${id}/documents/${d.id}/pdf`, '_blank')
}

const DIR_TO_SLUG: Record<'sales' | 'procurement', string> = {
  sales: 'sales',
  procurement: 'procurement'
}
const projectHref = computed(() =>
  linkedProject.value
    ? `/${DIR_TO_SLUG[linkedProject.value.direction]}/${linkedProject.value.id}`
    : null
)

// `new Date()` would make this differ between the SSR render and the client's
// first (hydration) render, toggling the v-if and tripping a hydration
// mismatch. Only evaluate the date check after mount so both renders agree.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const isExpired = computed(
  () =>
    mounted.value &&
    !!header.validUntil &&
    header.validUntil < new Date().toISOString().slice(0, 10) &&
    header.status !== 'accepted' &&
    header.status !== 'declined'
)
</script>

<template>
  <div class="page-quote-detail">
    <NuxtLink to="/quotes" class="back">
      <UIcon name="i-lucide-arrow-left" class="size-3.5" />
      <span class="mono">{{ $t('nav.quotes') }}</span>
    </NuxtLink>

    <UiPageHead :title="header.number || $t('quotes.untitledQuote')">
      <template #subtitle>
        <div class="page-quote-detail__sub">
          <UiOutlinedChip
            :status="
              header.status === 'accepted'
                ? 'paid'
                : header.status === 'declined'
                  ? 'draft'
                  : header.status
            "
          >
            {{ $t(`status.${header.status}`) }}
          </UiOutlinedChip>
          <span v-if="header.status === 'accepted' && q.accepted_at" class="mono note">
            {{ $t('quotes.acceptedAt', { date: dateCh(q.accepted_at) }) }}
          </span>
          <span v-if="header.status === 'declined' && q.declined_at" class="mono note">
            {{ $t('quotes.declinedAt', { date: dateCh(q.declined_at) }) }}
          </span>
          <span v-if="isExpired" class="mono note warn">
            {{ $t('quotes.expiredHint', { date: dateCh(header.validUntil) }) }}
          </span>
          <NuxtLink
            v-if="linkedProject && projectHref"
            :to="projectHref"
            class="page-quote-detail__project-link"
          >
            <UIcon name="i-lucide-kanban" class="size-3.5" />
            <span>{{ linkedProject.name }}</span>
          </NuxtLink>
        </div>
      </template>
      <template #actions>
        <button class="ed-btn-ghost" @click="confirmDelete = true">
          <UIcon name="i-lucide-trash-2" class="size-3.5" /> {{ $t('common.delete') }}
        </button>
      </template>
    </UiPageHead>

    <div v-if="convertedInvoice" class="converted-banner">
      <UIcon name="i-lucide-arrow-right-circle" class="size-4" />
      <span>{{
        $t('quotes.convertedTo', { number: convertedInvoice.number || '#' + convertedInvoice.id })
      }}</span>
      <NuxtLink :to="`/invoices/${convertedInvoice.id}`" class="ed-btn-ghost">
        {{ $t('quotes.openInvoice') }}
      </NuxtLink>
    </div>

    <UiCard>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('common.title')" class="sm:col-span-2">
          <UInput v-model="header.title" class="w-full" />
        </UFormField>
        <UFormField :label="$t('quotes.number')">
          <UInput v-model="header.number" class="w-full" />
        </UFormField>
        <UFormField :label="$t('invoices.projectCol')">
          <USelect v-model="header.projectId" :items="projectOptions" class="w-full" />
        </UFormField>
        <UFormField :label="$t('quotes.issueDate')">
          <UiDatePicker v-model="header.issueDate" />
        </UFormField>
        <UFormField :label="$t('quotes.validUntil')">
          <UiDatePicker v-model="header.validUntil" />
        </UFormField>
      </div>
    </UiCard>

    <UiSectionLabel>{{ $t('invoices.lineItems') }}</UiSectionLabel>
    <UiCard>
      <EmptyState
        v-if="!items.length"
        :bordered="false"
        icon="i-lucide-list"
        :title="$t('invoices.noLinesTitle')"
        :description="$t('invoices.noLinesText')"
      >
        <template #action>
          <button class="ed-btn" type="button" @click="addRow">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('invoices.addLine') }}
          </button>
        </template>
      </EmptyState>
      <div v-else>
        <div class="lines-head mono">
          <div class="c-art">{{ $t('invoices.article') }}</div>
          <div class="c-desc">{{ $t('invoices.description') }}</div>
          <div class="c-qty">{{ $t('invoices.qty') }}</div>
          <div class="c-unit">{{ $t('articles.colUnit') }}</div>
          <div class="c-price">{{ $t('articles.colPrice') }}</div>
          <div class="c-disc">{{ $t('invoices.discPct') }}</div>
          <div v-if="vat" class="c-vat">{{ $t('invoices.vatPct') }}</div>
          <div class="c-amt right">{{ $t('common.amount') }}</div>
        </div>
        <div v-for="(row, i) in items" :key="i" class="line-row">
          <UInput
            v-model="row.articleName"
            list="qd-article-names"
            :placeholder="$t('quotes.articlePlaceholder')"
            class="w-full"
            @change="onArticleName(row)"
          />
          <UInput v-model="row.description" class="w-full" />
          <UInput v-model.number="row.quantity" type="number" step="0.01" class="w-full" />
          <UInput v-model="row.unit" class="w-full" />
          <UInput v-model.number="row.unitPrice" type="number" step="0.05" class="w-full" />
          <UInput v-model.number="row.discountPercent" type="number" step="0.1" class="w-full" />
          <UInput
            v-if="vat"
            v-model.number="row.mwstPercent"
            type="number"
            step="0.1"
            class="w-full"
          />
          <div class="amt mono">
            <span>CHF {{ chf(lineAmount(row)) }}</span>
            <button type="button" class="icon-btn" @click="removeRow(i)">
              <UIcon name="i-lucide-x" />
            </button>
          </div>
        </div>
        <div class="add-row">
          <button class="ed-btn-ghost" type="button" @click="addRow">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('invoices.addLine') }}
          </button>
        </div>
        <!-- Native suggestions for the free-text article field. -->
        <datalist id="qd-article-names">
          <option v-for="n in articleNames" :key="n" :value="n" />
        </datalist>
      </div>
    </UiCard>

    <UiCard class="mt-4">
      <dl class="totals">
        <div v-if="vat" class="t-row">
          <dt class="eyebrow">{{ $t('invoices.netto') }}</dt>
          <dd class="mono">CHF {{ chf(totals.nettoRappen) }}</dd>
        </div>
        <div v-for="r in totals.mwstByRate" :key="r.rate" class="t-row">
          <dt class="eyebrow">{{ $t('common.vat') }} {{ r.rate }}%</dt>
          <dd class="mono">CHF {{ chf(r.mwstRappen) }}</dd>
        </div>
        <div class="t-row total">
          <dt class="eyebrow">{{ $t('common.total') }}</dt>
          <dd class="mono">CHF {{ chf(totals.totalRappen) }}</dd>
        </div>
      </dl>
    </UiCard>

    <UiSectionLabel>{{ $t('quotes.references') }}</UiSectionLabel>
    <UiCard>
      <p class="qdoc-intro note">{{ $t('quotes.referencesHint') }}</p>
      <div v-if="references.length" class="qref-list">
        <div v-for="(r, i) in references" :key="i" class="qref">
          <UInput
            v-model="r.label"
            :placeholder="$t('quotes.refLabelPlaceholder')"
            class="qref__label"
          />
          <UInput
            v-model="r.url"
            inputmode="url"
            :placeholder="$t('quotes.refUrlPlaceholder')"
            class="qref__url"
          />
          <button
            type="button"
            class="icon-btn"
            :aria-label="$t('common.delete')"
            @click="removeRef(i)"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>
      </div>
      <div class="qdoc-foot">
        <button class="ed-btn" type="button" @click="addRef">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('quotes.refAdd') }}
        </button>
      </div>
    </UiCard>

    <UiSectionLabel>{{ $t('quotes.documents') }}</UiSectionLabel>
    <UiCard>
      <p class="qdoc-intro note">{{ $t('quotes.documentsHint') }}</p>
      <ul v-if="documents.length" class="qdoc-list">
        <li v-for="d in documents" :key="d.id" class="qdoc">
          <button type="button" class="qdoc__name" @click="openDoc(d)">
            <UIcon name="i-lucide-file-text" class="size-3.5" />
            {{ d.title }}
          </button>
          <UCheckbox
            :model-value="!!d.attach"
            :label="$t('quotes.docAttach')"
            @update:model-value="toggleAttach(d, $event as boolean)"
          />
          <div class="qdoc__actions">
            <button
              class="icon-btn"
              type="button"
              :title="$t('quotes.docPreview')"
              :aria-label="$t('quotes.docPreview')"
              @click="previewDoc(d)"
            >
              <UIcon name="i-lucide-eye" />
            </button>
            <button
              class="icon-btn"
              type="button"
              :title="$t('common.delete')"
              :aria-label="$t('common.delete')"
              @click="deleteDoc(d)"
            >
              <UIcon name="i-lucide-trash-2" />
            </button>
          </div>
        </li>
      </ul>
      <div class="qdoc-foot">
        <button class="ed-btn" type="button" @click="openNewDoc">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('quotes.docNew') }}
        </button>
      </div>
    </UiCard>

    <div class="foot">
      <button class="ed-btn-ghost" :disabled="saving" @click="save">
        {{ $t('common.save') }}
      </button>
      <button
        v-if="header.status === 'draft' || header.status === 'sent'"
        class="ed-btn"
        :disabled="saving || !customer?.email"
        @click="openSend"
      >
        <UIcon name="i-lucide-send" class="size-3.5" /> {{ $t('quotes.send') }}
      </button>
      <button
        v-if="header.status === 'sent'"
        class="ed-btn"
        :disabled="saving"
        @click="markDeclined"
      >
        <UIcon name="i-lucide-x" class="size-3.5" /> {{ $t('quotes.decline') }}
      </button>
      <button
        v-if="header.status === 'sent' || header.status === 'draft'"
        class="ed-btn-primary"
        :disabled="saving"
        @click="markAccepted"
      >
        <UIcon name="i-lucide-check" class="size-3.5" /> {{ $t('quotes.accept') }}
      </button>
      <button
        v-if="header.status === 'accepted' && !convertedInvoice"
        class="ed-btn-primary"
        :disabled="saving"
        @click="convertToInvoice"
      >
        <UIcon name="i-lucide-arrow-right" class="size-3.5" /> {{ $t('quotes.convertToInvoice') }}
      </button>
    </div>

    <UModal v-model:open="confirmDelete" :title="$t('quotes.deleteConfirmTitle')">
      <template #body>
        <p>{{ $t('quotes.deleteConfirmText') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="confirmDelete = false">
            {{ $t('common.cancel') }}
          </button>
          <button class="ed-btn-primary" @click="removeQuote">{{ $t('common.delete') }}</button>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="sendOpen"
      :title="$t('quotes.sendModalTitle', { number: header.number || '#' + id })"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <template v-if="!sendPreview">
            <UFormField :label="$t('invoices.recipient')">
              <UInput
                v-if="customer?.email"
                :model-value="customer.email"
                disabled
                class="mono w-full"
              />
              <p v-else class="warn">{{ $t('invoices.noEmail') }}</p>
            </UFormField>
            <UFormField :label="$t('quotes.subject')">
              <UInput v-model="emailSubject" class="w-full" />
            </UFormField>
            <UFormField :label="$t('quotes.message')">
              <ClientOnly>
                <UEditor
                  v-model="emailMessage"
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
            <UFormField v-if="signatures.length" :label="$t('settings.signatures.tab')">
              <USelect v-model="signatureId" :items="signatureItems" class="w-full" />
            </UFormField>
          </template>
          <EmailPreviewFrame v-else :body-html="emailMessage" :signature-id="signatureId" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <template v-if="!sendPreview">
            <button class="ed-btn-ghost" @click="sendOpen = false">
              {{ $t('common.cancel') }}
            </button>
            <button class="ed-btn-primary" :disabled="!customer?.email" @click="sendPreview = true">
              <UIcon name="i-lucide-eye" class="size-3.5" /> {{ $t('settings.signatures.preview') }}
            </button>
          </template>
          <template v-else>
            <button class="ed-btn-ghost" @click="sendPreview = false">
              <UIcon name="i-lucide-arrow-left" class="size-3.5" />
              {{ $t('settings.signatures.edit') }}
            </button>
            <button
              class="ed-btn-primary"
              :disabled="saving || !customer?.email"
              @click="sendQuote"
            >
              <UIcon name="i-lucide-send" class="size-3.5" /> {{ $t('quotes.send') }}
            </button>
          </template>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showLeaveDialog"
      :title="$t('common.leaveDirtyTitle')"
      :description="$t('common.leaveDirty')"
      :dismissible="false"
    >
      <template #footer>
        <button class="ed-btn-ghost" @click="answerLeave(false)">{{ $t('common.cancel') }}</button>
        <button class="ed-btn-primary" @click="answerLeave(true)">
          {{ $t('common.leaveAnyway') }}
        </button>
      </template>
    </UModal>

    <USlideover
      v-model:open="docEditor.open"
      :title="docEditor.id ? $t('quotes.docEdit') : $t('quotes.docNew')"
      :ui="{ content: 'max-w-full sm:max-w-3xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="$t('quotes.docTitle')">
            <UInput
              v-model="docEditor.title"
              :placeholder="$t('quotes.docTitlePlaceholder')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="$t('quotes.docContent')">
            <ClientOnly>
              <UEditor
                v-model="docEditor.content"
                content-type="json"
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
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="docEditor.open = false">
            {{ $t('common.cancel') }}
          </button>
          <button class="ed-btn-primary" :disabled="docEditor.saving" @click="saveDoc">
            {{ $t('common.save') }}
          </button>
        </div>
      </template>
    </USlideover>
  </div>
</template>
