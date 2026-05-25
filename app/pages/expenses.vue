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
  attachments: { id: number, filename: string }[]
}

const { t } = useI18n()
const month = ref(new Date().toISOString().slice(0, 7))

const { data: expenses, refresh } = await useFetch<Expense[]>('/api/expenses', {
  query: { month },
  default: () => []
})
const { data: categories } = await useFetch<Category[]>('/api/categories', {
  default: () => []
})

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
    : expenses.value.filter((e) => e.category_id != null && activeCategories.value.has(e.category_id))
)
const total = computed(() => filtered.value.reduce((sum, e) => sum + e.amount_rappen, 0))

const today = new Date().toISOString().slice(0, 10)
function blank() {
  return {
    id: null as number | null,
    title: '',
    amount: undefined as number | undefined,
    date: today,
    categoryId: null as number | null,
    vendor: '',
    notes: ''
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}
function openEdit(e: Expense) {
  Object.assign(form, {
    id: e.id,
    title: e.title,
    amount: e.amount_rappen / 100,
    date: e.date,
    categoryId: e.category_id,
    vendor: e.vendor ?? '',
    notes: e.notes ?? ''
  })
  open.value = true
}

async function save() {
  if (!form.title.trim() || !form.amount) return
  saving.value = true
  try {
    const { id, ...body } = form
    if (id) {
      await $fetch(`/api/expenses/${id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/expenses', { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function removeExpense(id: number) {
  await $fetch(`/api/expenses/${id}`, { method: 'DELETE' })
  await refresh()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.expenses')" :description="$t('expenses.subtitle')">
      <template #actions>
        <MonthSelect v-model="month" />
        <div class="inline-flex items-center gap-2 rounded-md bg-elevated px-3 h-8">
          <span class="text-xs text-muted">{{ $t('common.total') }}</span>
          <span class="text-sm font-semibold tabular-nums text-highlighted">CHF {{ chf(total) }}</span>
        </div>
      </template>
    </PageHeader>

    <UCard>
      <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="c in expenseCategories"
            :key="c.id"
            size="xs"
            color="neutral"
            :variant="activeCategories.has(c.id) ? 'solid' : 'outline'"
            @click="toggleCategory(c.id)"
          >
            <UIcon :name="c.icon" :style="{ color: c.color }" class="size-3" />
            {{ c.name }}
          </UButton>
        </div>
        <UButton icon="i-lucide-plus" @click="openCreate">{{ $t('expenses.add') }}</UButton>
      </div>

      <EmptyState
        v-if="!filtered.length"
        icon="i-lucide-receipt"
        :title="$t('expenses.emptyTitle')"
        :description="$t('expenses.emptyText')"
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[680px] text-sm">
        <thead class="text-muted text-left">
          <tr class="border-b border-default">
            <th class="py-2 font-medium">{{ $t('common.date') }}</th>
            <th class="py-2 font-medium">{{ $t('common.title') }}</th>
            <th class="py-2 font-medium">{{ $t('common.category') }}</th>
            <th class="py-2 font-medium">{{ $t('common.vendor') }}</th>
            <th class="py-2 font-medium">{{ $t('expenses.receipts') }}</th>
            <th class="py-2 font-medium text-right">{{ $t('common.amount') }}</th>
            <th class="py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in filtered"
            :key="e.id"
            class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
          >
            <td class="py-2 whitespace-nowrap">{{ e.date }}</td>
            <td class="py-2">{{ e.title }}</td>
            <td class="py-2">
              <span v-if="e.category_name" class="inline-flex items-center gap-1.5">
                <UIcon :name="e.category_icon!" :style="{ color: e.category_color! }" class="size-4" />
                {{ e.category_name }}
              </span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="py-2">{{ e.vendor || '-' }}</td>
            <td class="py-2">
              <ExpenseReceipts :expense-id="e.id" :attachments="e.attachments" @changed="refresh" />
            </td>
            <td class="py-2 text-right whitespace-nowrap">{{ e.currency }} {{ chf(e.amount_rappen) }}</td>
            <td class="py-2 text-right whitespace-nowrap">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openEdit(e)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                @click="removeExpense(e.id)"
              />
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('expenses.edit') : $t('expenses.add')"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="save">
          <UFormField :label="$t('common.title')" class="sm:col-span-2">
            <UInput v-model="form.title" :placeholder="$t('expenses.titlePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="$t('expenses.amountField')">
            <UInput v-model.number="form.amount" type="number" min="0" step="0.05" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.date')">
            <UInput v-model="form.date" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.category')">
            <USelect v-model="form.categoryId" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.vendor')">
            <UInput v-model="form.vendor" class="w-full" />
          </UFormField>
          <UFormField :label="$t('common.notes')" class="sm:col-span-2">
            <UTextarea v-model="form.notes" :rows="3" autoresize class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ $t('common.cancel') }}</UButton>
          <UButton :loading="saving" @click="save">{{ $t('common.save') }}</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>