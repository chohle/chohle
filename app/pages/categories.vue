<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
}

const { data: categories, refresh } = await useFetch<Category[]>('/api/categories', {
  default: () => []
})

const iconOptions = [
  'i-lucide-shopping-cart', 'i-lucide-utensils', 'i-lucide-car', 'i-lucide-home',
  'i-lucide-plug', 'i-lucide-briefcase', 'i-lucide-plane', 'i-lucide-heart-pulse',
  'i-lucide-banknote', 'i-lucide-landmark', 'i-lucide-gift', 'i-lucide-wrench',
  'i-lucide-smartphone', 'i-lucide-coffee', 'i-lucide-fuel', 'i-lucide-book',
  'i-lucide-dumbbell', 'i-lucide-graduation-cap'
]
const colorOptions = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#10b981', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'
]

function blank() {
  return {
    id: null as number | null,
    name: '',
    type: 'expense' as Category['type'],
    color: colorOptions[6],
    icon: iconOptions[0]
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}
function openEdit(c: Category) {
  Object.assign(form, { id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon })
  open.value = true
}

async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { name: form.name, type: form.type, color: form.color, icon: form.icon }
    if (form.id) {
      await $fetch(`/api/categories/${form.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/categories', { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function removeCategory(id: number) {
  await $fetch(`/api/categories/${id}`, { method: 'DELETE' })
  await refresh()
}

const expense = computed(() => categories.value.filter((c) => c.type === 'expense'))
const income = computed(() => categories.value.filter((c) => c.type === 'income'))
</script>

<template>
  <div>
    <PageHeader title="Categories" description="Labels for organizing expenses and income." />

    <UCard>
      <div class="flex justify-end mb-4">
        <UButton icon="i-lucide-plus" @click="openCreate">Add category</UButton>
      </div>

      <EmptyState
        v-if="!expense.length && !income.length"
        icon="i-lucide-tags"
        title="No categories"
        description="Create categories to organize your expenses and income."
      />
      <div v-else class="grid sm:grid-cols-2 gap-6">
        <CategoryList title="Expenses" :categories="expense" @edit="openEdit" @remove="removeCategory" />
        <CategoryList title="Income" :categories="income" @edit="openEdit" @remove="removeCategory" />
      </div>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? 'Edit category' : 'Add category'"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-6">
          <div class="flex items-center gap-3 rounded-lg border border-default p-3">
            <span
              class="size-10 rounded-full flex items-center justify-center shrink-0"
              :style="{ backgroundColor: form.color + '20', color: form.color }"
            >
              <UIcon :name="form.icon" class="size-5" />
            </span>
            <span class="font-medium truncate">{{ form.name || 'New category' }}</span>
          </div>

          <UFormField label="Name">
            <UInput v-model="form.name" placeholder="e.g. Groceries" class="w-full" autofocus />
          </UFormField>

          <UFormField label="Type">
            <div class="flex gap-2">
              <UButton
                :variant="form.type === 'expense' ? 'solid' : 'outline'"
                color="neutral"
                @click="form.type = 'expense'"
              >
                Expense
              </UButton>
              <UButton
                :variant="form.type === 'income' ? 'solid' : 'outline'"
                color="neutral"
                @click="form.type = 'income'"
              >
                Income
              </UButton>
            </div>
          </UFormField>

          <UFormField label="Icon">
            <div class="grid grid-cols-6 gap-2">
              <button
                v-for="ic in iconOptions"
                :key="ic"
                type="button"
                class="aspect-square rounded-lg border flex items-center justify-center transition"
                :class="form.icon === ic
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-default text-muted hover:bg-elevated'"
                @click="form.icon = ic"
              >
                <UIcon :name="ic" class="size-5" />
              </button>
            </div>
          </UFormField>

          <UFormField label="Color">
            <div class="flex flex-wrap gap-2.5">
              <button
                v-for="col in colorOptions"
                :key="col"
                type="button"
                class="size-8 rounded-full flex items-center justify-center ring-offset-2 ring-offset-default"
                :class="form.color === col ? 'ring-2 ring-inverted' : ''"
                :style="{ backgroundColor: col }"
                @click="form.color = col"
              >
                <UIcon v-if="form.color === col" name="i-lucide-check" class="size-4 text-white" />
              </button>
            </div>
          </UFormField>
        </div>
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
