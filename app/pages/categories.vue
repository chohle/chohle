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
const {
  data: categories,
  refresh,
  error
} = await useFetch<Category[]>('/api/categories', {
  default: () => []
})

const iconOptions = [
  'i-lucide-shopping-cart',
  'i-lucide-utensils',
  'i-lucide-car',
  'i-lucide-home',
  'i-lucide-plug',
  'i-lucide-briefcase',
  'i-lucide-plane',
  'i-lucide-heart-pulse',
  'i-lucide-banknote',
  'i-lucide-landmark',
  'i-lucide-gift',
  'i-lucide-wrench',
  'i-lucide-smartphone',
  'i-lucide-coffee',
  'i-lucide-fuel',
  'i-lucide-book',
  'i-lucide-dumbbell',
  'i-lucide-graduation-cap'
]
// Color is no longer user-selectable: every category renders in ink.
// The DB column still exists; we keep writing a constant so existing rows stay valid.
const INK = '#0A0A0A'

function blank() {
  return {
    id: null as number | null,
    name: '',
    type: 'expense' as Category['type'],
    color: INK,
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
  Object.assign(form, { id: c.id, name: c.name, type: c.type, color: INK, icon: c.icon })
  open.value = true
}
function validate(state: typeof form) {
  const errors: { name: string; message: string }[] = []
  if (!state.name.trim()) errors.push({ name: 'name', message: t('validation.required') })
  return errors
}
async function save() {
  saving.value = true
  try {
    const body = { name: form.name, type: form.type, color: form.color, icon: form.icon }
    if (form.id) await $fetch(`/api/categories/${form.id}`, { method: 'PUT', body })
    else await $fetch('/api/categories', { method: 'POST', body })
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}
const confirm = useConfirm()
async function removeCategory(id: number) {
  if (!(await confirm())) return
  await $fetch(`/api/categories/${id}`, { method: 'DELETE' })
  await refresh()
}

const expense = computed(() => categories.value.filter((c) => c.type === 'expense'))
const income = computed(() => categories.value.filter((c) => c.type === 'income'))
</script>

<template>
  <div class="page-categories">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.categories')}`"
      :title="$t('nav.categories')"
      :subtitle="$t('categories.subtitle')"
    >
      <template #actions>
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('categories.add') }}
        </button>
      </template>
    </UiPageHead>

    <UiCard>
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <EmptyState
        v-else-if="!expense.length && !income.length"
        :bordered="false"
        icon="i-lucide-tags"
        :title="$t('categories.emptyTitle')"
        :description="$t('categories.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="openCreate">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('categories.add') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="grid gap-6 sm:grid-cols-2">
        <CategoryList
          :title="$t('nav.expenses')"
          :categories="expense"
          @edit="openEdit"
          @remove="removeCategory"
        />
        <CategoryList
          :title="$t('nav.income')"
          :categories="income"
          @edit="openEdit"
          @remove="removeCategory"
        />
      </div>
    </UiCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('categories.edit') : $t('categories.add')"
      :ui="{ content: 'max-w-full sm:max-w-md' }"
    >
      <template #body>
        <UForm
          ref="formRef"
          :state="form"
          :validate="validate"
          novalidate
          class="space-y-6"
          @submit="save"
        >
          <div class="category-form__preview">
            <span class="category-form__ico">
              <UIcon :name="form.icon" class="size-5" />
            </span>
            <span class="category-form__name">{{ form.name || $t('categories.newCategory') }}</span>
          </div>
          <UFormField name="name" :label="$t('common.name')">
            <UInput v-model="form.name" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="$t('common.type')">
            <div class="category-form__type-row">
              <button
                type="button"
                class="ed-btn"
                :class="{ 'is-active': form.type === 'expense' }"
                @click="form.type = 'expense'"
              >
                {{ $t('categories.typeExpense') }}
              </button>
              <button
                type="button"
                class="ed-btn"
                :class="{ 'is-active': form.type === 'income' }"
                @click="form.type = 'income'"
              >
                {{ $t('categories.typeIncome') }}
              </button>
            </div>
          </UFormField>
          <UFormField :label="$t('categories.icon')">
            <div
              class="category-form__icon-grid"
              role="radiogroup"
              :aria-label="$t('categories.icon')"
            >
              <button
                v-for="ic in iconOptions"
                :key="ic"
                type="button"
                role="radio"
                class="category-form__icon-swatch"
                :class="{ 'is-active': form.icon === ic }"
                :aria-checked="form.icon === ic"
                :aria-label="ic.replace(/^i-lucide-/, '').replace(/-/g, ' ')"
                @click="form.icon = ic"
              >
                <UIcon :name="ic" class="size-4" />
              </button>
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
