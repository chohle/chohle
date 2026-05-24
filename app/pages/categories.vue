<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
}

const { data: categories, refresh } = await useFetch<Category[]>('/api/categories')

const iconOptions = [
  'i-lucide-shopping-cart',
  'i-lucide-car',
  'i-lucide-utensils',
  'i-lucide-home',
  'i-lucide-plug',
  'i-lucide-briefcase',
  'i-lucide-plane',
  'i-lucide-heart-pulse',
  'i-lucide-banknote',
  'i-lucide-landmark',
  'i-lucide-gift',
  'i-lucide-wrench'
]

const typeOptions = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' }
]

const form = reactive({
  name: '',
  type: 'expense' as Category['type'],
  color: '#3b82f6',
  icon: iconOptions[0]
})
const saving = ref(false)

async function addCategory() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    await $fetch('/api/categories', { method: 'POST', body: { ...form } })
    form.name = ''
    await refresh()
  } finally {
    saving.value = false
  }
}

async function removeCategory(id: number) {
  await $fetch(`/api/categories/${id}`, { method: 'DELETE' })
  await refresh()
}

const expense = computed(() => categories.value?.filter((c) => c.type === 'expense') ?? [])
const income = computed(() => categories.value?.filter((c) => c.type === 'income') ?? [])
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="text-2xl font-bold">Categories</h1>
    <p class="text-muted mt-1">Labels for organizing expenses and income.</p>

    <UCard class="mt-6">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addCategory">
        <UFormField label="Name" class="flex-1 min-w-40">
          <UInput v-model="form.name" placeholder="e.g. Groceries" class="w-full" />
        </UFormField>
        <UFormField label="Type">
          <USelect v-model="form.type" :items="typeOptions" class="w-32" />
        </UFormField>
        <UFormField label="Icon">
          <USelect v-model="form.icon" :items="iconOptions" :icon="form.icon" class="w-44" />
        </UFormField>
        <UFormField label="Color">
          <input
            v-model="form.color"
            type="color"
            class="h-8 w-12 rounded border border-default bg-default cursor-pointer"
          >
        </UFormField>
        <UButton type="submit" icon="i-lucide-plus" :loading="saving">Add</UButton>
      </form>
    </UCard>

    <div class="grid sm:grid-cols-2 gap-6 mt-6">
      <CategoryList title="Expenses" :categories="expense" @remove="removeCategory" />
      <CategoryList title="Income" :categories="income" @remove="removeCategory" />
    </div>
  </div>
</template>