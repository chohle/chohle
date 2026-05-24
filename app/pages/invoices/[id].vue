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
interface Rate {
  article_id: number
  name: string
  unit: string
  default_price_rappen: number
  default_mwst: number
  override_rappen: number | null
}

const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const { data } = await useFetch<{ invoice: InvoiceRow, items: ItemRow[] }>(`/api/invoices/${id}`)
const inv = data.value!.invoice
const customerId = inv.customer_id

const { data: rates } = await useFetch<Rate[]>(`/api/customers/${customerId}/rates`, {
  default: () => []
})

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
  rates.value.map((r) => ({ label: r.name, value: r.article_id }))
)
const statusItems = [
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' }
]

function onArticle(row: EditRow) {
  const r = rates.value.find((x) => x.article_id === row.articleId)
  if (!r) return
  row.description = r.name
  row.unit = r.unit
  row.unitPrice = (r.override_rappen ?? r.default_price_rappen) / 100
  row.mwstPercent = r.default_mwst
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
const totals = computed(() => computeInvoiceTotals(items.value.map(toLine)))

function lineAmount(r: EditRow) {
  return lineNetRappen(toLine(r))
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch(`/api/invoices/${id}`, { method: 'PUT', body: { ...header, items: items.value } })
    toast.add({ title: 'Invoice saved', color: 'success' })
  } finally {
    saving.value = false
  }
}
async function removeInvoice() {
  await $fetch(`/api/invoices/${id}`, { method: 'DELETE' })
  await navigateTo(`/customers/${customerId}`)
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
</script>

<template>
  <div class="max-w-4xl">
    <NuxtLink :to="`/customers/${customerId}`" class="text-sm text-muted hover:underline">
      &larr; Customer
    </NuxtLink>

    <div class="flex items-center justify-between gap-4 mt-2">
      <h1 class="text-2xl font-bold">Invoice {{ header.number }}</h1>
      <div class="flex gap-2">
        <UButton color="error" variant="ghost" icon="i-lucide-trash-2" @click="removeInvoice">
          Delete
        </UButton>
        <UButton :loading="saving" @click="save">Save</UButton>
      </div>
    </div>

    <UCard class="mt-6">
      <div class="grid sm:grid-cols-2 gap-4">
        <UFormField label="Title" class="sm:col-span-2">
          <UInput v-model="header.title" class="w-full" />
        </UFormField>
        <UFormField label="Number">
          <UInput v-model="header.number" class="w-full" />
        </UFormField>
        <UFormField label="Status">
          <USelect v-model="header.status" :items="statusItems" class="w-full" />
        </UFormField>
        <UFormField label="Issue date">
          <UInput v-model="header.issueDate" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Payable until">
          <UInput v-model="header.dueDate" type="date" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Line items</h2>
          <UButton size="sm" icon="i-lucide-plus" variant="soft" @click="addRow">Add line</UButton>
        </div>
      </template>

      <p v-if="!items.length" class="text-muted text-sm">No line items yet.</p>
      <div v-else class="space-y-3">
        <div
          v-for="(row, i) in items"
          :key="i"
          class="grid grid-cols-12 gap-2 items-end border-b border-default pb-3 last:border-0"
        >
          <UFormField label="Article" class="col-span-3">
            <USelect
              v-model="row.articleId"
              :items="articleItems"
              class="w-full"
              @update:model-value="onArticle(row)"
            />
          </UFormField>
          <UFormField label="Description" class="col-span-3">
            <UInput v-model="row.description" class="w-full" />
          </UFormField>
          <UFormField label="Qty" class="col-span-1">
            <UInput v-model.number="row.quantity" type="number" step="0.01" class="w-full" />
          </UFormField>
          <UFormField label="Unit" class="col-span-1">
            <UInput v-model="row.unit" class="w-full" />
          </UFormField>
          <UFormField label="Price" class="col-span-1">
            <UInput v-model.number="row.unitPrice" type="number" step="0.05" class="w-full" />
          </UFormField>
          <UFormField label="Disc%" class="col-span-1">
            <UInput v-model.number="row.discountPercent" type="number" step="0.1" class="w-full" />
          </UFormField>
          <UFormField label="MWST%" class="col-span-1">
            <UInput v-model.number="row.mwstPercent" type="number" step="0.1" class="w-full" />
          </UFormField>
          <div class="col-span-1 flex items-center justify-end gap-1 pb-1">
            <span class="text-sm whitespace-nowrap">{{ chf(lineAmount(row)) }}</span>
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
    </UCard>

    <UCard class="mt-6">
      <dl class="space-y-1 text-sm max-w-xs ml-auto">
        <div class="flex justify-between">
          <dt class="text-muted">Netto</dt>
          <dd>CHF {{ chf(totals.nettoRappen) }}</dd>
        </div>
        <div v-for="r in totals.mwstByRate" :key="r.rate" class="flex justify-between">
          <dt class="text-muted">MWST {{ r.rate }}%</dt>
          <dd>CHF {{ chf(r.mwstRappen) }}</dd>
        </div>
        <div class="flex justify-between font-semibold border-t border-default pt-1">
          <dt>Total</dt>
          <dd>CHF {{ chf(totals.totalRappen) }}</dd>
        </div>
      </dl>
    </UCard>
  </div>
</template>