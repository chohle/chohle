<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
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

const categoryItems = computed(() => [
  { label: 'No category', value: null },
  ...categories.value
    .filter((c) => c.type === 'expense')
    .map((c) => ({ label: c.name, value: c.id }))
])

const today = new Date().toISOString().slice(0, 10)
const form = reactive({
  title: '',
  amount: undefined as number | undefined,
  date: today,
  categoryId: null as number | null,
  vendor: '',
  notes: ''
})
const saving = ref(false)

async function addExpense() {
  if (!form.title.trim() || !form.amount) return
  saving.value = true
  try {
    await $fetch('/api/expenses', { method: 'POST', body: { ...form } })
    Object.assign(form, { title: '', amount: undefined, vendor: '', notes: '' })
    await refresh()
  } finally {
    saving.value = false
  }
}

async function removeExpense(id: number) {
  await $fetch(`/api/expenses/${id}`, { method: 'DELETE' })
  await refresh()
}

const total = computed(() => expenses.value.reduce((sum, e) => sum + e.amount_rappen, 0))

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
      </div>
    </div>

    <UCard class="mt-6">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addExpense">
        <UFormField label="Title" class="flex-1 min-w-40">
          <UInput v-model="form.title" placeholder="e.g. Office chair" class="w-full" />
        </UFormField>
        <UFormField label="Amount (CHF)">
          <UInput v-model.number="form.amount" type="number" min="0" step="0.05" class="w-28" />
        </UFormField>
        <UFormField label="Date">
          <UInput v-model="form.date" type="date" class="w-40" />
        </UFormField>
        <UFormField label="Category">
          <USelect v-model="form.categoryId" :items="categoryItems" class="w-40" />
        </UFormField>
        <UFormField label="Vendor">
          <UInput v-model="form.vendor" class="w-36" />
        </UFormField>
        <UButton type="submit" icon="i-lucide-plus" :loading="saving">Add</UButton>
      </form>
    </UCard>

    <UCard class="mt-6">
      <p v-if="!expenses.length" class="text-muted text-sm">No expenses this month.</p>
      <table v-else class="w-full text-sm">
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
          <tr v-for="e in expenses" :key="e.id" class="border-b border-default last:border-0">
            <td class="py-2 whitespace-nowrap">{{ e.date }}</td>
            <td class="py-2">{{ e.title }}</td>
            <td class="py-2">
              <span v-if="e.category_name" class="inline-flex items-center gap-1.5">
                <UIcon
                  :name="e.category_icon!"
                  :style="{ color: e.category_color! }"
                  class="size-4"
                />
                {{ e.category_name }}
              </span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="py-2">{{ e.vendor || '-' }}</td>
            <td class="py-2">
              <ExpenseReceipts
                :expense-id="e.id"
                :attachments="e.attachments"
                @changed="refresh"
              />
            </td>
            <td class="py-2 text-right whitespace-nowrap">{{ e.currency }} {{ chf(e.amount_rappen) }}</td>
            <td class="py-2 text-right">
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
    </UCard>
  </div>
</template>