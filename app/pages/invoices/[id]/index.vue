<script setup lang="ts">
interface InvoiceRow {
  customer_id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  due_date: string
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

const { data } = await useFetch<{ invoice: InvoiceRow, items: ItemRow[] }>(`/api/invoices/${id}`)
const inv = data.value!.invoice
const customerId = inv.customer_id

const { data: globalArticles } = await useFetch<Article[]>('/api/articles', { default: () => [] })
const { data: customerArticles } = await useFetch<Article[]>(
  `/api/customers/${customerId}/articles`,
  { default: () => [] }
)
const { data: sender } = await useFetch<{ vat_registered: number, name: string }>('/api/sender')
const { data: customer } = await useFetch<{ name: string, email: string | null, language: string }>(
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

const articleItems = computed(() =>
  articles.value.map((a) => ({ label: a.name, value: a.id }))
)

// The stepper drives the status: draft -> (send) -> sent/paid.
const steps = computed(() => [
  { slot: 'draft', title: t('status.draft'), icon: 'i-lucide-file-pen-line' },
  { slot: 'send', title: t('invoices.send'), icon: 'i-lucide-send' },
  { slot: 'paid', title: t('status.paid'), icon: 'i-lucide-circle-check' }
])
const statusToStep: Record<string, number> = { draft: 0, sent: 2, paid: 2 }
const step = ref(statusToStep[inv.status] ?? 0)

function onArticle(row: EditRow) {
  const a = articles.value.find((x) => x.id === row.articleId)
  if (!a) return
  row.description = a.name
  row.unit = a.unit
  row.unitPrice = a.default_price_rappen / 100
  row.mwstPercent = a.default_mwst
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
async function save() {
  saving.value = true
  try {
    await $fetch(`/api/invoices/${id}`, { method: 'PUT', body: { ...header, items: items.value } })
    toast.add({ title: t('invoices.toastSaved'), color: 'success' })
  } finally {
    saving.value = false
  }
}
async function removeInvoice() {
  await $fetch(`/api/invoices/${id}`, { method: 'DELETE' })
  await navigateTo(`/customers/${customerId}`)
}

async function previewPdf() {
  await save()
  await navigateTo(`/invoices/${id}/print`)
}

async function continueToSend() {
  await save()
  step.value = 1
}
async function sendInvoice() {
  saving.value = true
  try {
    await $fetch(`/api/invoices/${id}`, { method: 'PUT', body: { ...header, items: items.value } })
    await $fetch(`/api/invoices/${id}/send`, {
      method: 'POST',
      body: { subject: emailSubject.value, message: emailMessage.value }
    })
    header.status = 'sent'
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
function dateFmt(iso: string) {
  const [y, m, d] = iso.split('-')
  return d ? `${d}.${m}.${y}` : ''
}

// Compose the email in the customer's language; fields stay editable per send.
const custLocale = customer.value?.language ?? 'en'
await loadLocaleMessages(custLocale)
const td = (key: string, named?: Record<string, unknown>) => t(key, named ?? {}, { locale: custLocale })

const subjectOverride = ref<string | null>(null)
const messageOverride = ref<string | null>(null)
const emailSubject = computed({
  get: () => subjectOverride.value ?? td('email.subject', { number: header.number }),
  set: (v: string) => { subjectOverride.value = v }
})
const emailMessage = computed({
  get: () =>
    messageOverride.value ??
    td('email.body', {
      customer: customer.value?.name ?? '',
      number: header.number,
      due: dateFmt(header.dueDate),
      sender: sender.value?.name ?? ''
    }),
  set: (v: string) => { messageOverride.value = v }
})
</script>

<template>
  <div>
    <PageHeader
      :title="$t('invoices.titleNumber', { number: header.number })"
      :back-to="`/customers/${customerId}`"
      :back-label="$t('customers.colCustomer')"
    >
      <template #actions>
        <UButton color="error" variant="ghost" icon="i-lucide-trash-2" @click="removeInvoice">
          {{ $t('common.delete') }}
        </UButton>
        <UButton :loading="saving" @click="save">{{ $t('common.save') }}</UButton>
      </template>
    </PageHeader>

    <UStepper v-model="step" :items="steps" :linear="false" class="mb-6" />

    <!-- Step 1: Draft -->
    <template v-if="step === 0">
      <UCard>
        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField :label="$t('common.title')" class="sm:col-span-2">
            <UInput v-model="header.title" class="w-full" />
          </UFormField>
          <UFormField :label="$t('invoices.number')">
            <UInput v-model="header.number" class="w-full" />
          </UFormField>
          <UFormField :label="$t('invoices.issueDate')">
            <UInput v-model="header.issueDate" type="date" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard class="mt-6">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ $t('invoices.lineItems') }}</h2>
            <UButton size="sm" icon="i-lucide-plus" variant="soft" @click="addRow">{{ $t('invoices.addLine') }}</UButton>
          </div>
        </template>

        <EmptyState
          v-if="!items.length"
          :bordered="false"
          icon="i-lucide-list"
          :title="$t('invoices.noLinesTitle')"
          :description="$t('invoices.noLinesText')"
        >
          <template #action>
            <UButton size="sm" icon="i-lucide-plus" variant="soft" @click="addRow">{{ $t('invoices.addLine') }}</UButton>
          </template>
        </EmptyState>
        <div v-else>
          <div class="hidden sm:grid grid-cols-12 gap-2 pb-2 text-xs font-medium text-muted">
            <div class="col-span-2">{{ $t('invoices.article') }}</div>
            <div :class="vat ? 'col-span-3' : 'col-span-4'">{{ $t('invoices.description') }}</div>
            <div class="col-span-1">{{ $t('invoices.qty') }}</div>
            <div class="col-span-1">{{ $t('articles.colUnit') }}</div>
            <div class="col-span-1">{{ $t('articles.colPrice') }}</div>
            <div class="col-span-1">{{ $t('invoices.discPct') }}</div>
            <div v-if="vat" class="col-span-1">{{ $t('invoices.vatPct') }}</div>
            <div class="col-span-2 text-right">{{ $t('common.amount') }}</div>
          </div>

          <div class="space-y-3 sm:space-y-0">
            <div
              v-for="(row, i) in items"
              :key="i"
              class="grid grid-cols-2 sm:grid-cols-12 gap-x-2 gap-y-3 items-start sm:items-center rounded-lg border border-default p-3 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:p-0 sm:pb-3 sm:last:border-b-0 sm:last:pb-0"
            >
              <div class="col-span-2">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('invoices.article') }}</label>
                <USelect
                  v-model="row.articleId"
                  :items="articleItems"
                  class="w-full"
                  @update:model-value="onArticle(row)"
                />
              </div>
              <div class="col-span-2" :class="vat ? 'sm:col-span-3' : 'sm:col-span-4'">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('invoices.description') }}</label>
                <UInput v-model="row.description" class="w-full" />
              </div>
              <div class="col-span-1">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('invoices.qty') }}</label>
                <UInput v-model.number="row.quantity" type="number" step="0.01" class="w-full" />
              </div>
              <div class="col-span-1">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('articles.colUnit') }}</label>
                <UInput v-model="row.unit" class="w-full" />
              </div>
              <div class="col-span-1">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('articles.colPrice') }}</label>
                <UInput v-model.number="row.unitPrice" type="number" step="0.05" class="w-full" />
              </div>
              <div class="col-span-1">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('invoices.discPct') }}</label>
                <UInput v-model.number="row.discountPercent" type="number" step="0.1" class="w-full" />
              </div>
              <div v-if="vat" class="col-span-1">
                <label class="mb-1 block text-xs font-medium text-muted sm:hidden">{{ $t('invoices.vatPct') }}</label>
                <UInput v-model.number="row.mwstPercent" type="number" step="0.1" class="w-full" />
              </div>
              <div
                class="col-span-2 flex items-center justify-between sm:justify-end gap-2 border-t border-default pt-3 mt-1 sm:mt-0 sm:border-0 sm:pt-0"
              >
                <span class="text-sm font-medium tabular-nums whitespace-nowrap">
                  CHF {{ chf(lineAmount(row)) }}
                </span>
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="removeRow(i)"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="mt-6">
        <dl class="space-y-1 text-sm max-w-xs ml-auto">
          <div v-if="vat" class="flex justify-between">
            <dt class="text-muted">{{ $t('invoices.netto') }}</dt>
            <dd>CHF {{ chf(totals.nettoRappen) }}</dd>
          </div>
          <div v-for="r in totals.mwstByRate" :key="r.rate" class="flex justify-between">
            <dt class="text-muted">{{ $t('common.vat') }} {{ r.rate }}%</dt>
            <dd>CHF {{ chf(r.mwstRappen) }}</dd>
          </div>
          <div class="flex justify-between font-semibold border-t border-default pt-1">
            <dt>{{ $t('common.total') }}</dt>
            <dd>CHF {{ chf(totals.totalRappen) }}</dd>
          </div>
        </dl>
      </UCard>

      <div class="mt-6 flex justify-end">
        <UButton trailing-icon="i-lucide-arrow-right" :loading="saving" @click="continueToSend">
          {{ $t('invoices.continue') }}
        </UButton>
      </div>
    </template>

    <!-- Step 2: Send -->
    <template v-else-if="step === 1">
      <UCard>
        <div class="space-y-6">
          <UFormField :label="$t('invoices.dueDate')">
            <UInput v-model="header.dueDate" type="date" class="w-56" />
          </UFormField>

          <div class="flex items-center justify-between gap-3 rounded-lg border border-default p-3">
            <div class="min-w-0">
              <div class="text-xs text-muted">{{ $t('common.total') }}</div>
              <div class="font-semibold tabular-nums">CHF {{ chf(totals.totalRappen) }}</div>
            </div>
            <UButton variant="soft" icon="i-lucide-file-text" @click="previewPdf">
              {{ $t('invoices.pdfPreview') }}
            </UButton>
          </div>

          <UFormField :label="$t('invoices.recipient')">
            <UInput
              v-if="customer?.email"
              :model-value="customer.email"
              disabled
              class="w-full"
            />
            <p v-else class="text-sm text-warning">{{ $t('invoices.noEmail') }}</p>
          </UFormField>

          <UFormField :label="$t('invoices.emailSubject')">
            <UInput v-model="emailSubject" class="w-full" />
          </UFormField>
          <UFormField :label="$t('invoices.emailMessage')">
            <UTextarea v-model="emailMessage" :rows="7" autoresize class="w-full" />
          </UFormField>

          <p class="text-xs text-muted">{{ $t('invoices.sendNote') }}</p>
        </div>
      </UCard>

      <div class="mt-6 flex justify-between">
        <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="step = 0">
          {{ $t('common.back') }}
        </UButton>
        <UButton icon="i-lucide-send" :loading="saving" :disabled="!customer?.email" @click="sendInvoice">
          {{ $t('invoices.sendInvoice') }}
        </UButton>
      </div>
    </template>

    <!-- Step 3: Paid -->
    <template v-else>
      <UCard>
        <div class="flex flex-col items-center gap-4 py-6 text-center">
          <span
            class="size-14 rounded-2xl flex items-center justify-center"
            :class="header.status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
          >
            <UIcon
              :name="header.status === 'paid' ? 'i-lucide-circle-check' : 'i-lucide-clock'"
              class="size-7"
            />
          </span>
          <div>
            <div class="font-semibold">
              {{ header.status === 'paid' ? $t('invoices.paidDone') : $t('invoices.awaitingPayment') }}
            </div>
            <div class="text-sm text-muted tabular-nums">CHF {{ chf(totals.totalRappen) }}</div>
          </div>

          <div class="flex gap-2">
            <UButton variant="soft" icon="i-lucide-file-text" @click="previewPdf">
              {{ $t('invoices.pdfPreview') }}
            </UButton>
            <UButton
              v-if="header.status !== 'paid'"
              icon="i-lucide-circle-check"
              :loading="saving"
              @click="setStatus('paid')"
            >
              {{ $t('invoices.markPaid') }}
            </UButton>
            <UButton
              v-else
              color="neutral"
              variant="outline"
              :loading="saving"
              @click="setStatus('sent')"
            >
              {{ $t('invoices.markUnpaid') }}
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
