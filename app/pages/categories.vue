<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
}

const { t } = useI18n()
const formRef = ref()
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

function validate(state: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!state.name.trim()) errors.push({ name: 'name', message: t('validation.required') })
  return errors
}

async function save() {
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
    <PageHeader :title="$t('nav.categories')" :description="$t('categories.subtitle')" />

    <UCard>
      <div class="flex justify-end mb-4">
        <UButton icon="i-lucide-plus" @click="openCreate">{{ $t('categories.add') }}</UButton>
      </div>

      <EmptyState
        v-if="!expense.length && !income.length"
        icon="i-lucide-tags"
        :title="$t('categories.emptyTitle')"
        :description="$t('categories.emptyText')"
      />
      <div v-else class="grid sm:grid-cols-2 gap-6">
        <CategoryList :title="$t('nav.expenses')" :categories="expense" @edit="openEdit" @remove="removeCategory" />
        <CategoryList :title="$t('nav.income')" :categories="income" @edit="openEdit" @remove="removeCategory" />
      </div>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('categories.edit') : $t('categories.add')"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <UForm ref="formRef" :state="form" :validate="validate" class="space-y-6" @submit="save">
          <div class="flex items-center gap-3 rounded-lg border border-default p-3">
            <span
              class="size-10 rounded-full flex items-center justify-center shrink-0"
              :style="{ backgroundColor: form.color + '20', color: form.color }"
            >
              <UIcon :name="form.icon" class="size-5" />
            </span>
            <span class="font-medium truncate">{{ form.name || $t('categories.newCategory') }}</span>
          </div>

          <UFormField name="name" :label="$t('common.name')">
            <UInput v-model="form.name" :placeholder="$t('categories.namePlaceholder')" class="w-full" autofocus />
          </UFormField>

          <UFormField :label="$t('common.type')">
            <div class="flex gap-2">
              <UButton
                :variant="form.type === 'expense' ? 'solid' : 'outline'"
                color="neutral"
                @click="form.type = 'expense'"
              >
                {{ $t('categories.typeExpense') }}
              </UButton>
              <UButton
                :variant="form.type === 'income' ? 'solid' : 'outline'"
                color="neutral"
                @click="form.type = 'income'"
              >
                {{ $t('categories.typeIncome') }}
              </UButton>
            </div>
          </UFormField>

          <UFormField :label="$t('categories.icon')">
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

          <UFormField :label="$t('categories.color')">
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
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ $t('common.cancel') }}</UButton>
          <UButton :loading="saving" @click="formRef?.submit()">{{ $t('common.save') }}</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>
