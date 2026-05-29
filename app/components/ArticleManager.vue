<script setup lang="ts">
interface Article {
  id: number
  name: string
  unit: string
  default_price_rappen: number
  default_mwst: number
}

const props = defineProps<{ listUrl: string, createUrl: string }>()
const { t } = useI18n()
const formRef = ref()

const { data: articles, refresh } = await useFetch<Article[]>(props.listUrl, { default: () => [] })
const { data: sender } = await useFetch<{ vat_registered: number }>('/api/sender')
const vatRegistered = computed(() => !!sender.value?.vat_registered)

function blank() {
  return {
    id: null as number | null,
    name: '',
    unit: '',
    price: undefined as number | undefined,
    mwst: vatRegistered.value ? 8.1 : 0
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

const hasMwst = computed({
  get: () => (form.mwst ?? 0) > 0,
  set: (v: boolean) => { form.mwst = v ? (form.mwst > 0 ? form.mwst : 8.1) : 0 }
})

function openCreate() { Object.assign(form, blank()); open.value = true }
function openEdit(a: Article) {
  Object.assign(form, { id: a.id, name: a.name, unit: a.unit, price: a.default_price_rappen / 100, mwst: a.default_mwst })
  open.value = true
}

function validate(state: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!state.name?.trim()) errors.push({ name: 'name', message: t('validation.required') })
  if (state.price == null) errors.push({ name: 'price', message: t('validation.required') })
  else if (state.price <= 0) errors.push({ name: 'price', message: t('validation.positive') })
  return errors
}

async function save() {
  saving.value = true
  try {
    const body = { name: form.name, unit: form.unit, price: form.price, mwst: form.mwst }
    if (form.id) await $fetch(`/api/articles/${form.id}`, { method: 'PUT', body })
    else await $fetch(props.createUrl, { method: 'POST', body })
    open.value = false
    await refresh()
  } finally { saving.value = false }
}

async function remove(id: number) {
  await $fetch(`/api/articles/${id}`, { method: 'DELETE' })
  await refresh()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
</script>

<template>
  <div class="article-manager">
    <div v-if="articles.length" class="article-manager__head">
      <div class="eyebrow">{{ articles.length }} {{ $t('nav.articles') }}</div>
      <button class="ed-btn-primary" @click="openCreate">
        <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('articles.add') }}
      </button>
    </div>

    <EmptyState
      v-if="!articles.length"
      :bordered="false"
      icon="i-lucide-package"
      :title="$t('articles.emptyTitle')"
      :description="$t('articles.emptyText')"
    >
      <template #action>
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('articles.add') }}
        </button>
      </template>
    </EmptyState>
    <div v-else class="ed-scroll"><table class="ed-table">
      <thead>
        <tr>
          <th>{{ $t('common.name') }}</th>
          <th>{{ $t('articles.colUnit') }}</th>
          <th class="right">{{ $t('articles.colPrice') }}</th>
          <th class="right">{{ $t('common.vat') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in articles" :key="a.id" class="row">
          <td>{{ a.name }}</td>
          <td class="mono">{{ a.unit || '—' }}</td>
          <td class="right mono">CHF {{ chf(a.default_price_rappen) }}</td>
          <td class="right mono">{{ a.default_mwst ? `${a.default_mwst}%` : '—' }}</td>
          <td class="actions">
            <button class="icon-btn" @click="openEdit(a)"><UIcon name="i-lucide-pencil" /></button>
            <button class="icon-btn" @click="remove(a.id)"><UIcon name="i-lucide-trash-2" /></button>
          </td>
        </tr>
      </tbody>
    </table></div>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('articles.edit') : $t('articles.add')"
      :ui="{ content: 'max-w-full sm:max-w-md' }"
    >
      <template #body>
        <UForm ref="formRef" :state="form" :validate="validate" class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit="save">
          <UFormField name="name" :label="$t('common.name')" class="sm:col-span-2">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField name="unit" :label="$t('articles.unit')">
            <UInput v-model="form.unit" class="w-full" />
          </UFormField>
          <UFormField name="price" :label="$t('articles.price')">
            <UInput v-model.number="form.price" type="number" step="0.05" class="w-full" />
          </UFormField>
          <div class="sm:col-span-2">
            <USwitch v-model="hasMwst" :label="$t('articles.chargeMwst')" />
          </div>
          <UFormField v-if="hasMwst" name="mwst" :label="$t('articles.mwstPercent')" class="sm:col-span-2">
            <UInput v-model.number="form.mwst" type="number" min="0" step="0.1" class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button class="ed-btn-ghost" @click="open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="saving" @click="formRef?.submit()">{{ $t('common.save') }}</button>
        </div>
      </template>
    </USlideover>
  </div>
</template>
