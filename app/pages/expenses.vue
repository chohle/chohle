<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
}

interface Expense {
  id: number
  title: string
  amount_rappen: number
  currency: string
  date: string
  vendor: string | null
  notes: string | null
  category_id: number | null
  category_name: string | null
  category_color: string | null
  category_icon: string | null
  vat_rate: number
  attachments: { id: number; filename: string }[]
}

const { t } = useI18n()
const toast = useToast()
const month = ref(new Date().toISOString().slice(0, 7))

const {
  data: expenses,
  error,
  refresh
} = await useFetch<Expense[]>('/api/expenses', {
  query: { month },
  default: () => []
})
const { data: categories } = await useFetch<Category[]>('/api/categories', { default: () => [] })
// VAT % field only matters for VAT-registered businesses (drives the tax export).
const { data: sender } = await useFetch<{ vat_registered?: number }>('/api/sender', {
  default: () => ({})
})
const vatRegistered = computed(() => !!sender.value?.vat_registered)

const expenseCategories = computed(() => categories.value.filter((c) => c.type === 'expense'))
const categoryItems = computed(() => [
  { label: t('expenses.noCategory'), value: null },
  ...expenseCategories.value.map((c) => ({ label: c.name, value: c.id }))
])

const activeCategories = ref<Set<number>>(new Set())
function toggleCategory(id: number) {
  const next = new Set(activeCategories.value)
  next.has(id) ? next.delete(id) : next.add(id)
  activeCategories.value = next
}

const filtered = computed(() =>
  activeCategories.value.size === 0
    ? expenses.value
    : expenses.value.filter(
        (e) => e.category_id != null && activeCategories.value.has(e.category_id)
      )
)
const total = computed(() => filtered.value.reduce((sum, e) => sum + e.amount_rappen, 0))

const byCategory = computed(() => {
  const map = new Map<
    number,
    { id: number; name: string; color: string; icon: string; total: number; weight: 1 | 2 | 3 }
  >()
  for (const e of expenses.value) {
    if (e.category_id == null) continue
    const ex = map.get(e.category_id)
    if (ex) ex.total += e.amount_rappen
    else
      map.set(e.category_id, {
        id: e.category_id,
        name: e.category_name ?? '—',
        color: e.category_color ?? 'var(--ink-3)',
        icon: e.category_icon ?? 'i-lucide-tag',
        total: e.amount_rappen,
        weight: 1
      })
  }
  const arr = [...map.values()].sort((a, b) => b.total - a.total)
  arr.forEach((c, i) => {
    c.weight = i < 2 ? 1 : i < 4 ? 2 : 3
  })
  return arr
})

const donutSegments = computed(() =>
  byCategory.value.map((c) => ({ label: c.name, value: c.total, weight: c.weight }))
)

const today = new Date().toISOString().slice(0, 10)
function blank() {
  return {
    id: null as number | null,
    title: '',
    amount: undefined as number | undefined,
    date: today,
    categoryId: null as number | null,
    vendor: '',
    notes: '',
    vatRate: 0 as number
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

// Receipts in the form: existing ones (when editing) plus files picked now that
// get uploaded when the expense is saved (so you can attach a Beleg on create).
const fileInput = ref<HTMLInputElement>()
const pendingFiles = ref<File[]>([])
const editAttachments = ref<{ id: number; filename: string }[]>([])
/** Add the chosen files to the pending list (uploaded when the expense saves). */
function pickFiles(e: Event) {
  const fl = (e.target as HTMLInputElement).files
  if (fl) pendingFiles.value.push(...Array.from(fl))
  if (fileInput.value) fileInput.value.value = ''
}
/** Drop a not-yet-uploaded file from the pending list. */
function removePending(i: number) {
  pendingFiles.value.splice(i, 1)
}
/** Delete an existing receipt (edit mode); only updates the UI on success. */
async function removeAttachment(id: number) {
  try {
    await $fetch(`/api/attachments/${id}`, { method: 'DELETE' })
    editAttachments.value = editAttachments.value.filter((a) => a.id !== id)
    await refresh()
  } catch {
    toast.add({ title: t('expenses.receiptFailed'), color: 'error' })
  }
}

/** Open the form to add a new expense. */
function openCreate() {
  Object.assign(form, blank())
  pendingFiles.value = []
  editAttachments.value = []
  open.value = true
}
/** Open the form to edit an existing expense, preloading its receipts. */
function openEdit(e: Expense) {
  Object.assign(form, {
    id: e.id,
    title: e.title,
    amount: e.amount_rappen / 100,
    date: e.date,
    categoryId: e.category_id,
    vendor: e.vendor ?? '',
    notes: e.notes ?? '',
    vatRate: e.vat_rate ?? 0
  })
  pendingFiles.value = []
  editAttachments.value = e.attachments ?? []
  open.value = true
}

const formRef = ref()
function validate(state: typeof form) {
  const errors: { name: string; message: string }[] = []
  if (!state.title.trim()) errors.push({ name: 'title', message: t('validation.required') })
  if (state.amount == null) errors.push({ name: 'amount', message: t('validation.required') })
  else if (state.amount <= 0) errors.push({ name: 'amount', message: t('validation.positive') })
  if (state.vatRate < 0 || state.vatRate > 100)
    errors.push({ name: 'vatRate', message: t('validation.percent') })
  return errors
}
/** Create or update the expense, then upload any receipts picked in the form. */
async function save() {
  saving.value = true
  try {
    // 1) Save the expense itself. On failure, keep the form open to retry.
    try {
      if (form.id) {
        await $fetch(`/api/expenses/${form.id}`, { method: 'PUT', body: { ...form } })
      } else {
        const { id, ...body } = form
        // Remember the new id so a retry doesn't create a duplicate expense.
        form.id = (await $fetch<{ id: number }>('/api/expenses', { method: 'POST', body })).id
      }
    } catch {
      toast.add({ title: t('expenses.saveFailed'), color: 'error' })
      return
    }
    // 2) Upload receipts. The expense is already saved, so a failure here is a
    // distinct (non-fatal) error — we still close and refresh.
    if (form.id && pendingFiles.value.length) {
      try {
        const fd = new FormData()
        for (const f of pendingFiles.value) fd.append('files', f)
        await $fetch(`/api/expenses/${form.id}/attachments`, { method: 'POST', body: fd })
        pendingFiles.value = []
      } catch {
        toast.add({ title: t('expenses.attachmentsSaveFailed'), color: 'error' })
      }
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}
const confirm = useConfirm()
async function removeExpense(id: number) {
  if (!(await confirm())) return
  await $fetch(`/api/expenses/${id}`, { method: 'DELETE' })
  await refresh()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}
</script>

<template>
  <div class="page-expenses">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.expenses')}`"
      :title="$t('nav.expenses')"
      :subtitle="$t('expenses.subtitle')"
    >
      <template #actions>
        <MonthSelect v-model="month" />
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('expenses.add') }}
        </button>
      </template>
    </UiPageHead>

    <UiKpiRow>
      <UiKpiCell
        :label="$t('expenses.kpiTotalMonth')"
        currency="CHF"
        :value="chf(total)"
        inverted
      />
      <UiKpiCell :label="$t('expenses.kpiEntries')" :value="String(filtered.length)" />
      <UiKpiCell :label="$t('expenses.kpiCategories')" :value="String(byCategory.length)" />
      <UiKpiCell
        :label="$t('expenses.kpiAvg')"
        currency="CHF"
        :value="filtered.length ? chf(Math.round(total / filtered.length)) : '0'"
      />
    </UiKpiRow>

    <UiSectionLabel>{{ $t('expenses.breakdown') }}</UiSectionLabel>

    <div class="grid-2">
      <UiCard>
        <div class="card-head">
          <div class="eyebrow">{{ $t('expenses.byCategory') }}</div>
        </div>
        <div v-if="byCategory.length" class="donut-wrap">
          <UiDonut
            :segments="donutSegments"
            :label="$t('expenses.thisMonth')"
            :center-value="`CHF ${chf(total)}`"
          />
          <ul class="legend">
            <li v-for="c in byCategory" :key="c.id">
              <span class="dot" :class="`w${c.weight}`" />
              <span class="lg-name">{{ c.name }}</span>
              <span class="mono lg-val">CHF {{ chf(c.total) }}</span>
            </li>
          </ul>
        </div>
        <EmptyState
          v-else
          :bordered="false"
          icon="i-lucide-pie-chart"
          :title="$t('expenses.noBreakdownTitle')"
          :description="$t('expenses.noBreakdownText')"
        />
      </UiCard>

      <UiCard>
        <div class="card-head">
          <div class="eyebrow">{{ $t('expenses.quickFilter') }}</div>
        </div>
        <div class="filter-grid">
          <button
            v-for="c in expenseCategories"
            :key="c.id"
            class="chip-btn"
            :class="{ active: activeCategories.has(c.id) }"
            @click="toggleCategory(c.id)"
          >
            <UIcon :name="c.icon" class="size-3.5" />
            <span>{{ c.name }}</span>
          </button>
        </div>
      </UiCard>
    </div>

    <UiSectionLabel>{{ $t('expenses.recent') }}</UiSectionLabel>

    <UiCard>
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <EmptyState
        v-else-if="!filtered.length"
        :bordered="false"
        icon="i-lucide-receipt"
        :title="$t('expenses.emptyTitle')"
        :description="$t('expenses.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="openCreate">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('expenses.add') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="ed-scroll">
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('common.date') }}</th>
              <th>{{ $t('common.title') }}</th>
              <th>{{ $t('common.category') }}</th>
              <th>{{ $t('common.vendor') }}</th>
              <th>{{ $t('expenses.receipts') }}</th>
              <th class="right">{{ $t('common.amount') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in filtered" :key="e.id" class="row">
              <td class="mono">{{ dateCh(e.date) }}</td>
              <td>{{ e.title }}</td>
              <td>
                <span v-if="e.category_name" class="cat">
                  <UIcon :name="e.category_icon!" class="size-3.5" />
                  {{ e.category_name }}
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td>{{ e.vendor || '—' }}</td>
              <td>
                <ExpenseReceipts
                  :expense-id="e.id"
                  :attachments="e.attachments"
                  @changed="refresh"
                />
              </td>
              <td class="right mono">−{{ e.currency }} {{ chf(e.amount_rappen) }}</td>
              <td class="actions">
                <button class="icon-btn" @click="openEdit(e)">
                  <UIcon name="i-lucide-pencil" />
                </button>
                <button class="icon-btn" @click="removeExpense(e.id)">
                  <UIcon name="i-lucide-trash-2" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('expenses.edit') : $t('expenses.add')"
      :ui="{ content: 'max-w-full sm:max-w-xl' }"
    >
      <template #body>
        <UForm
          ref="formRef"
          :state="form"
          :validate="validate"
          novalidate
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
          @submit="save"
        >
          <UFormField name="title" :label="$t('common.title')" class="sm:col-span-2">
            <UInput v-model="form.title" class="w-full" />
          </UFormField>
          <UFormField name="amount" :label="$t('expenses.amountField')">
            <UInput v-model.number="form.amount" type="number" step="0.05" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.date')">
            <UiDatePicker v-model="form.date" />
          </UFormField>
          <UFormField :label="$t('common.category')">
            <USelect v-model="form.categoryId" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.vendor')">
            <UInput v-model="form.vendor" class="w-full" />
          </UFormField>
          <UFormField
            v-if="vatRegistered"
            name="vatRate"
            :label="$t('taxExport.expenseVat')"
            :help="$t('taxExport.expenseVatHint')"
          >
            <UInput
              v-model.number="form.vatRate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="$t('common.notes')" class="sm:col-span-2">
            <UTextarea v-model="form.notes" :rows="3" autoresize class="w-full" />
          </UFormField>
          <UFormField :label="$t('expenses.receipts')" class="sm:col-span-2">
            <div class="rec">
              <span v-for="a in editAttachments" :key="a.id" class="rec__chip mono">
                <a :href="`/api/attachments/${a.id}`" target="_blank" class="rec__link">
                  <UIcon name="i-lucide-paperclip" class="size-3" />
                  <span class="rec__fname">{{ a.filename }}</span>
                </a>
                <button
                  type="button"
                  class="rec__rm"
                  :aria-label="`${$t('common.delete')}: ${a.filename}`"
                  :title="`${$t('common.delete')}: ${a.filename}`"
                  @click="removeAttachment(a.id)"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </span>
              <span v-for="(f, i) in pendingFiles" :key="`p${i}`" class="rec__chip mono">
                <span class="rec__link">
                  <UIcon name="i-lucide-file-plus" class="size-3" />
                  <span class="rec__fname">{{ f.name }}</span>
                </span>
                <button
                  type="button"
                  class="rec__rm"
                  :aria-label="`${$t('common.delete')}: ${f.name}`"
                  :title="`${$t('common.delete')}: ${f.name}`"
                  @click="removePending(i)"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </span>
              <button type="button" class="rec__up" @click="fileInput?.click()">
                <UIcon name="i-lucide-upload" class="size-3" />
                <span>{{ $t('expenses.receipt') }}</span>
              </button>
              <input
                ref="fileInput"
                type="file"
                multiple
                accept="application/pdf,image/*"
                class="rec__file"
                @change="pickFiles"
              />
            </div>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="saving" @click="formRef?.submit()">
            {{ $t('common.save') }}
          </button>
        </div>
      </template>
    </USlideover>
  </div>
</template>
