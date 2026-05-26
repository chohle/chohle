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
    // No MWST by default when the owner isn't VAT-registered (e.g. solo < CHF 100k).
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

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}
function openEdit(a: Article) {
  Object.assign(form, {
    id: a.id,
    name: a.name,
    unit: a.unit,
    price: a.default_price_rappen / 100,
    mwst: a.default_mwst
  })
  open.value = true
}

function validate(state: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!state.name?.trim()) errors.push({ name: 'name', message: t('validation.required') })
  if (state.price == null) errors.push({ name: 'price', message: t('validation.required') })
  return errors
}

async function save() {
  saving.value = true
  try {
    const body = { name: form.name, unit: form.unit, price: form.price, mwst: form.mwst }
    if (form.id) {
      await $fetch(`/api/articles/${form.id}`, { method: 'PUT', body })
    } else {
      await $fetch(props.createUrl, { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await $fetch(`/api/articles/${id}`, { method: 'DELETE' })
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
    <div class="flex justify-end mb-4">
      <UButton icon="i-lucide-plus" @click="openCreate">{{ $t('articles.add') }}</UButton>
    </div>

    <EmptyState
      v-if="!articles.length"
      icon="i-lucide-package"
      :title="$t('articles.emptyTitle')"
      :description="$t('articles.emptyText')"
    />
    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[480px] text-sm">
      <thead class="text-muted text-left">
        <tr class="border-b border-default">
          <th class="py-2 font-medium">{{ $t('common.name') }}</th>
          <th class="py-2 font-medium">{{ $t('articles.colUnit') }}</th>
          <th class="py-2 font-medium text-right">{{ $t('articles.colPrice') }}</th>
          <th class="py-2 font-medium text-right">{{ $t('common.vat') }}</th>
          <th class="py-2" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="a in articles"
          :key="a.id"
          class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
        >
          <td class="py-2">{{ a.name }}</td>
          <td class="py-2">{{ a.unit || '-' }}</td>
          <td class="py-2 text-right whitespace-nowrap">CHF {{ chf(a.default_price_rappen) }}</td>
          <td class="py-2 text-right">{{ a.default_mwst ? `${a.default_mwst}%` : '-' }}</td>
          <td class="py-2 text-right whitespace-nowrap">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(a)" />
            <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(a.id)" />
          </td>
        </tr>
      </tbody>
      </table>
    </div>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('articles.edit') : $t('articles.add')"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <UForm ref="formRef" :state="form" :validate="validate" class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit="save">
          <UFormField name="name" :label="$t('common.name')" class="sm:col-span-2">
            <UInput v-model="form.name" :placeholder="$t('articles.namePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField name="unit" :label="$t('articles.unit')">
            <UInput v-model="form.unit" :placeholder="$t('articles.unitPlaceholder')" class="w-full" />
          </UFormField>
          <UFormField name="price" :label="$t('articles.price')">
            <UInput v-model.number="form.price" type="number" min="0" step="0.05" class="w-full" />
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
          <UButton color="neutral" variant="ghost" @click="open = false">{{ $t('common.cancel') }}</UButton>
          <UButton :loading="saving" @click="formRef?.submit()">{{ $t('common.save') }}</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>
