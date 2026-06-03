<script setup lang="ts">
interface InvoiceRow {
  customer_id: number
  project_id: number | null
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  due_date: string
  step: number
}
interface ProjectMini {
  id: number
  name: string
  direction: 'sales' | 'procurement'
}
interface ItemRow {
  article_id: number | null
  description: string
  quantity: number
  unit: string
  unit_price_rappen: number
  discount_percent: number
  mwst_percent: number
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

const { data } = await useFetch<{
  invoice: InvoiceRow
  items: ItemRow[]
  project: ProjectMini | null
}>(`/api/invoices/${id}`)
const inv = data.value!.invoice
const linkedProject = data.value!.project
const customerId = inv.customer_id

const DIR_TO_SLUG: Record<'sales' | 'procurement', string> = {
  sales: 'sales',
  procurement: 'procurement'
}
const projectHref = computed(() =>
  linkedProject ? `/${DIR_TO_SLUG[linkedProject.direction]}/${linkedProject.id}` : null
)

const { data: globalArticles } = await useFetch<Article[]>('/api/articles', { default: () => [] })
const { data: customerArticles } = await useFetch<Article[]>(
  `/api/customers/${customerId}/articles`,
  { default: () => [] }
)
const { data: sender } = await useFetch<{
  vat_registered: number
  name: string
  email_template: string
}>('/api/sender')
const { data: customer } = await useFetch<{ name: string; email: string | null; language: string }>(
  `/api/customers/${customerId}`
)
const vat = computed(() => !!sender.value?.vat_registered)
const articles = computed(() => [...globalArticles.value, ...customerArticles.value])

const header = reactive({
  number: inv.number,
  title: inv.title,
  status: inv.status,
  issueDate: inv.issue_date,
  dueDate: inv.due_date
})

interface EditRow {
  articleId: number | null
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
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitPrice: i.unit_price_rappen / 100,
    discountPercent: i.discount_percent,
    mwstPercent: i.mwst_percent
  }))
)

const articleItems = computed(() => articles.value.map((a) => ({ label: a.name, value: a.id })))

const stepLabels = computed(() => [t('status.draft'), t('invoices.send'), t('status.paid')])
const step = ref(inv.status === 'draft' ? inv.step : 2)
watch(step, (v) => {
  $fetch(`/api/invoices/${id}/step`, { method: 'PATCH', body: { step: v } }).catch(() => {})
})

function onArticle(row: EditRow) {
  const a = articles.value.find((x) => x.id === row.articleId)
  if (!a) return
  row.description = a.name
  row.unit = a.unit
  row.unitPrice = a.default_price_rappen / 100
  row.mwstPercent = a.default_mwst
}
function onArticleSelect(row: EditRow, articleId: number | null) {
  row.articleId = articleId
  onArticle(row)
}
function addRow() {
  items.value.push({
    articleId: null,
    description: '',
    quantity: 1,
    unit: '',
    unitPrice: 0,
    discountPercent: 0,
    mwstPercent: 8.1
  })
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
const formRef = ref()
const lineState = reactive({ items })

function snapshot() {
  return JSON.stringify({ ...header, items: items.value })
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

function validate() {
  const errors: { name: string; message: string }[] = []
  items.value.forEach((row, i) => {
    if (!row.description.trim())
      errors.push({ name: `items.${i}.description`, message: t('validation.required') })
    if (row.quantity == null)
      errors.push({ name: `items.${i}.quantity`, message: t('validation.required') })
    else if (row.quantity <= 0)
      errors.push({ name: `items.${i}.quantity`, message: t('validation.positive') })
    if (row.unitPrice == null)
      errors.push({ name: `items.${i}.unitPrice`, message: t('validation.required') })
    else if (row.unitPrice <= 0)
      errors.push({ name: `items.${i}.unitPrice`, message: t('validation.positive') })
  })
  return errors
}
async function save() {
  saving.value = true
  try {
    await $fetch(`/api/invoices/${id}`, { method: 'PUT', body: { ...header, items: items.value } })
    baseline.value = snapshot()
    toast.add({ title: t('invoices.toastSaved'), color: 'success' })
  } finally {
    saving.value = false
  }
}
async function removeInvoice() {
  await $fetch(`/api/invoices/${id}`, { method: 'DELETE' })
  baseline.value = snapshot()
  await navigateTo(`/customers/${customerId}`)
}
async function previewPdf() {
  await save()
  await navigateTo(`/invoices/${id}/print`)
}
async function continueToSend() {
  await save()
  sendPreview.value = false
  step.value = 1
}
async function sendInvoice() {
  saving.value = true
  try {
    await $fetch(`/api/invoices/${id}`, { method: 'PUT', body: { ...header, items: items.value } })
    await $fetch(`/api/invoices/${id}/send`, {
      method: 'POST',
      body: {
        subject: emailSubject.value,
        message: emailMessage.value,
        signature_id: signatureId.value ?? undefined
      }
    })
    header.status = 'sent'
    baseline.value = snapshot()
    toast.add({ title: t('invoices.toastSent'), color: 'success' })
    step.value = 2
  } catch (e) {
    toast.add({
      title: t('invoices.sendError'),
      description: (e as { statusMessage?: string }).statusMessage,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
async function setStatus(status: InvoiceRow['status']) {
  header.status = status
  await save()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const custLocale = (customer.value?.language ?? 'en') as Parameters<typeof loadLocaleMessages>[0]
await loadLocaleMessages(custLocale)
const td = (key: string, named?: Record<string, unknown>) =>
  t(key, named ?? {}, { locale: custLocale })

const subjectOverride = ref<string | null>(null)
const messageOverride = ref<string | null>(null)
const emailSubject = computed({
  get: () => subjectOverride.value ?? td('email.subject', { number: header.number }),
  set: (v: string) => {
    subjectOverride.value = v
  }
})
function fillTemplate(html: string) {
  return html
    .replaceAll('{customer}', customer.value?.name ?? '')
    .replaceAll('{number}', header.number ?? '')
    .replaceAll('{due}', dateCh(header.dueDate))
    .replaceAll('{sender}', sender.value?.name ?? '')
}
const emailMessage = computed({
  get: () => messageOverride.value ?? fillTemplate(sender.value?.email_template ?? ''),
  set: (v: string) => {
    messageOverride.value = v
  }
})

// Signature picker + write/preview toggle for the send step.
const { signatures, defaultSignatureId, signatureItems } = useSignatures()
const signatureId = ref<number | null>(null)
watch(defaultSignatureId, (v) => { if (signatureId.value === null) signatureId.value = v }, {
  immediate: true
})
const sendPreview = ref(false)
</script>

<template>
  <div class="page-invoice-detail">
    <NuxtLink :to="projectHref ?? `/customers/${customerId}`" class="back">
      <UIcon name="i-lucide-arrow-left" class="size-3.5" />
      <span class="mono">{{
        linkedProject?.name || customer?.name || $t('customers.colCustomer')
      }}</span>
    </NuxtLink>

    <UiPageHead :title="$t('invoices.titleNumber', { number: header.number })">
      <template #subtitle>
        <NuxtLink
          v-if="linkedProject && projectHref"
          :to="projectHref"
          class="page-invoice-detail__project-link"
        >
          <UIcon name="i-lucide-kanban" class="size-3.5" />
          <span
            >{{ $t('invoices.fromProject') }}: <b>{{ linkedProject.name }}</b></span
          >
        </NuxtLink>
      </template>
      <template #actions>
        <button class="ed-btn-ghost" @click="confirmDelete = true">
          <UIcon name="i-lucide-trash-2" class="size-3.5" /> {{ $t('common.delete') }}
        </button>
      </template>
    </UiPageHead>

    <div class="progress">
      <div
        v-for="(label, i) in stepLabels"
        :key="i"
        class="seg"
        :class="{ done: i <= step, active: i === step }"
        @click="step = i"
      >
        <span class="seg-num mono">0{{ i + 1 }}</span>
        <span class="seg-label mono">{{ label }}</span>
      </div>
    </div>

    <UModal v-model:open="confirmDelete" :title="$t('invoices.deleteConfirmTitle')">
      <template #body
        ><p>{{ $t('invoices.deleteConfirmText') }}</p></template
      >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="confirmDelete = false">
            {{ $t('common.cancel') }}
          </button>
          <button class="ed-btn-primary" @click="removeInvoice">{{ $t('common.delete') }}</button>
        </div>
      </template>
    </UModal>

    <!-- Step 1: Draft -->
    <template v-if="step === 0">
      <UForm
        ref="formRef"
        :state="lineState"
        :validate="validate"
        novalidate
        @submit="continueToSend"
      >
        <UiCard>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField :label="$t('common.title')" class="sm:col-span-2">
              <UInput v-model="header.title" class="w-full" />
            </UFormField>
            <UFormField :label="$t('invoices.number')">
              <UInput v-model="header.number" class="w-full" />
            </UFormField>
            <UFormField :label="$t('invoices.issueDate')">
              <UiDatePicker v-model="header.issueDate" />
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
              <USelect
                :model-value="row.articleId ?? undefined"
                :items="articleItems"
                class="w-full"
                @update:model-value="onArticleSelect(row, $event)"
              />
              <UFormField :name="`items.${i}.description`">
                <UInput v-model="row.description" class="w-full" />
              </UFormField>
              <UFormField :name="`items.${i}.quantity`">
                <UInput v-model.number="row.quantity" type="number" step="0.01" class="w-full" />
              </UFormField>
              <UFormField :name="`items.${i}.unit`">
                <UInput v-model="row.unit" class="w-full" />
              </UFormField>
              <UFormField :name="`items.${i}.unitPrice`">
                <UInput v-model.number="row.unitPrice" type="number" step="0.05" class="w-full" />
              </UFormField>
              <UFormField :name="`items.${i}.discountPercent`">
                <UInput
                  v-model.number="row.discountPercent"
                  type="number"
                  step="0.1"
                  class="w-full"
                />
              </UFormField>
              <UFormField v-if="vat" :name="`items.${i}.mwstPercent`">
                <UInput v-model.number="row.mwstPercent" type="number" step="0.1" class="w-full" />
              </UFormField>
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
      </UForm>

      <div class="foot">
        <button class="ed-btn-ghost" :disabled="saving" @click="save">
          {{ $t('common.save') }}
        </button>
        <button class="ed-btn-primary" :disabled="saving" @click="formRef?.submit()">
          {{ $t('invoices.continue') }} <UIcon name="i-lucide-arrow-right" class="size-3.5" />
        </button>
      </div>
    </template>

    <!-- Step 2: Send -->
    <template v-else-if="step === 1">
      <UiCard>
        <div class="space-y-6">
          <template v-if="!sendPreview">
          <UFormField :label="$t('invoices.dueDate')">
            <UiDatePicker v-model="header.dueDate" />
          </UFormField>

          <div class="preview-row">
            <div>
              <div class="eyebrow">{{ $t('common.total') }}</div>
              <div class="preview-amt mono">CHF {{ chf(totals.totalRappen) }}</div>
            </div>
            <button class="ed-btn" @click="previewPdf">
              <UIcon name="i-lucide-file-text" class="size-3.5" /> {{ $t('invoices.pdfPreview') }}
            </button>
          </div>

          <UFormField :label="$t('invoices.recipient')">
            <UInput v-if="customer?.email" :model-value="customer.email" disabled class="w-full" />
            <p v-else class="warn">{{ $t('invoices.noEmail') }}</p>
          </UFormField>
          <UFormField :label="$t('invoices.emailSubject')">
            <UInput v-model="emailSubject" class="w-full" />
          </UFormField>
          <UFormField :label="$t('invoices.emailMessage')">
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

          <p class="muted-note">{{ $t('invoices.sendNote') }}</p>
          </template>
          <EmailPreviewFrame v-else :body-html="emailMessage" :signature-id="signatureId" />
        </div>
      </UiCard>

      <div class="foot">
        <template v-if="!sendPreview">
          <button class="ed-btn-ghost" @click="step = 0">
            <UIcon name="i-lucide-arrow-left" class="size-3.5" /> {{ $t('common.back') }}
          </button>
          <button
            class="ed-btn-primary"
            :disabled="!customer?.email"
            @click="sendPreview = true"
          >
            <UIcon name="i-lucide-eye" class="size-3.5" /> {{ $t('settings.signatures.preview') }}
          </button>
        </template>
        <template v-else>
          <button class="ed-btn-ghost" @click="sendPreview = false">
            <UIcon name="i-lucide-arrow-left" class="size-3.5" /> {{ $t('settings.signatures.edit') }}
          </button>
          <button class="ed-btn-primary" :disabled="saving || !customer?.email" @click="sendInvoice">
            <UIcon name="i-lucide-send" class="size-3.5" /> {{ $t('invoices.sendInvoice') }}
          </button>
        </template>
      </div>
    </template>

    <!-- Step 3: Paid -->
    <template v-else>
      <UiCard>
        <div class="paid-card">
          <div class="paid-label eyebrow">
            {{
              header.status === 'paid' ? $t('invoices.paidDone') : $t('invoices.awaitingPayment')
            }}
          </div>
          <div class="paid-amt tabular">CHF {{ chf(totals.totalRappen) }}</div>
          <div class="paid-actions">
            <button class="ed-btn-ghost" @click="step = 1">
              <UIcon name="i-lucide-arrow-left" class="size-3.5" /> {{ $t('common.back') }}
            </button>
            <button class="ed-btn" @click="previewPdf">
              <UIcon name="i-lucide-file-text" class="size-3.5" /> {{ $t('invoices.pdfPreview') }}
            </button>
            <button
              v-if="header.status !== 'paid'"
              class="ed-btn-primary"
              :disabled="saving"
              @click="setStatus('paid')"
            >
              <UIcon name="i-lucide-circle-check" class="size-3.5" /> {{ $t('invoices.markPaid') }}
            </button>
            <button v-else class="ed-btn" :disabled="saving" @click="setStatus('sent')">
              {{ $t('invoices.markUnpaid') }}
            </button>
          </div>
        </div>
      </UiCard>
    </template>

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
  </div>
</template>
