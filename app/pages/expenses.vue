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
  { label: 'No category', value: null },
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
  <div class="max-w-4xl">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">Expenses</h1>
        <p class="text-muted mt-1">Track what you buy, with the receipt.</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="month"
          type="month"
          class="h-8 rounded border border-default bg-default px-2"
        >
        <div class="text-right">
          <div class="text-xs text-muted">Total</div>
          <div class="font-semibold">CHF {{ chf(total) }}</div>
        </div>
        <UButton icon="i-lucide-plus" @click="openCreate">Add</UButton>
      </div>
    </div>

    <div v-if="expenseCategories.length" class="flex flex-wrap gap-2 mt-4">
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

    <UCard class="mt-6">
      <EmptyState
        v-if="!filtered.length"
        icon="i-lucide-receipt"
        title="No expenses"
        description="Add your first expense to start tracking where the money goes."
      >
        <template #action>
          <UButton icon="i-lucide-plus" @click="openCreate">Add expense</UButton>
        </template>
      </EmptyState>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[680px] text-sm">
        <thead class="text-muted text-left">
          <tr class="border-b border-default">
            <th class="py-2 font-medium">Date</th>
            <th class="py-2 font-medium">Title</th>
            <th class="py-2 font-medium">Category</th>
            <th class="py-2 font-medium">Vendor</th>
            <th class="py-2 font-medium">Receipts</th>
            <th class="py-2 font-medium text-right">Amount</th>
            <th class="py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in filtered" :key="e.id" class="border-b border-default last:border-0">
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
      :title="form.id ? 'Edit expense' : 'Add expense'"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
          <UFormField label="Title" class="col-span-2">
            <UInput v-model="form.title" placeholder="e.g. Office chair" class="w-full" />
          </UFormField>
          <UFormField label="Amount (CHF)">
            <UInput v-model.number="form.amount" type="number" min="0" step="0.05" class="w-full" />
          </UFormField>
          <UFormField label="Date">
            <UInput v-model="form.date" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="form.categoryId" :items="categoryItems" class="w-full" />
          </UFormField>
          <UFormField label="Vendor">
            <UInput v-model="form.vendor" class="w-full" />
          </UFormField>
          <UFormField label="Notes" class="col-span-2">
            <UTextarea v-model="form.notes" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>