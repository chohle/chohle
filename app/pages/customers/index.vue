<script setup lang="ts">
interface CustomerRow {
  id: number
  type: 'person' | 'company'
  name: string
  customer_number: string | null
  city: string | null
  payment_term_days: number
  logo_path: string | null
}

const { t, locale } = useI18n()
const {
  data: customers,
  refresh,
  error
} = await useFetch<CustomerRow[]>('/api/customers', {
  default: () => []
})

type SortKey = 'nameAsc' | 'nameDesc'

const filter = ref<'all' | 'company' | 'person'>('all')
const sortKey = ref<SortKey>('nameAsc')

const filterOptions = computed(() => [
  { value: 'all', label: `${t('customers.filterAll')} (${customers.value.length})` },
  {
    value: 'company',
    label: `${t('customers.filterCompany')} (${customers.value.filter((c) => c.type === 'company').length})`
  },
  {
    value: 'person',
    label: `${t('customers.filterPerson')} (${customers.value.filter((c) => c.type === 'person').length})`
  }
])

const sortItems = computed(() => [
  { value: 'nameAsc', label: t('customers.sortNameAsc') },
  { value: 'nameDesc', label: t('customers.sortNameDesc') }
])

const visibleRows = computed(() => {
  const collator = new Intl.Collator(locale.value, { sensitivity: 'base' })
  const rows = customers.value.filter((c) => filter.value === 'all' || c.type === filter.value)
  return [...rows].sort((a, b) =>
    sortKey.value === 'nameDesc'
      ? collator.compare(b.name, a.name)
      : collator.compare(a.name, b.name)
  )
})

const typeItems = computed(() => [
  { label: t('customers.typeCompany'), value: 'company' },
  { label: t('customers.typePerson'), value: 'person' }
])
const languageItems = computed(() => [
  { label: t('languages.de'), value: 'de' },
  { label: t('languages.fr'), value: 'fr' },
  { label: t('languages.it'), value: 'it' },
  { label: t('languages.en'), value: 'en' }
])

function blank() {
  return {
    id: null as number | null,
    type: 'company',
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    street: '',
    zip: '',
    city: '',
    country: 'CH',
    language: 'de',
    customerNumber: '',
    priceCategory: '',
    discountPercent: 0,
    paymentTermDays: 30,
    website: '',
    foundingYear: undefined as number | undefined,
    social: '',
    uid: '',
    mwst: '',
    hrNumber: ''
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}

async function openEdit(id: number) {
  const c = await $fetch<Record<string, unknown>>(`/api/customers/${id}`)
  Object.assign(form, {
    id: c.id,
    type: c.type,
    name: c.name ?? '',
    contactPerson: c.contact_person ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    street: c.street ?? '',
    zip: c.zip ?? '',
    city: c.city ?? '',
    country: c.country ?? 'CH',
    language: c.language ?? 'de',
    customerNumber: c.customer_number ?? '',
    priceCategory: c.price_category ?? '',
    discountPercent: c.discount_percent ?? 0,
    paymentTermDays: c.payment_term_days ?? 30,
    website: c.website ?? '',
    foundingYear: c.founding_year ?? undefined,
    social: c.social ?? '',
    uid: c.uid ?? '',
    mwst: c.mwst ?? '',
    hrNumber: c.hr_number ?? ''
  })
  open.value = true
}

const formRef = ref()
// Basic RFC-ish check — good enough to catch typos like "aadsf" without
// rejecting valid edge cases. Server is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(state: typeof form) {
  const errors: { name: string; message: string }[] = []
  const req = (key: keyof typeof state, fieldName: string) => {
    const v = state[key]
    if (typeof v !== 'string' || !v.trim())
      errors.push({ name: fieldName, message: t('validation.required') })
  }
  req('name', 'name')
  req('email', 'email')
  if (state.email?.trim() && !EMAIL_RE.test(state.email.trim())) {
    errors.push({ name: 'email', message: t('validation.email') })
  }
  req('phone', 'phone')
  req('street', 'street')
  req('zip', 'zip')
  req('city', 'city')
  req('country', 'country')
  return errors
}

async function save() {
  saving.value = true
  try {
    const { id, ...body } = form
    if (id) await $fetch(`/api/customers/${id}`, { method: 'PUT', body })
    else await $fetch('/api/customers', { method: 'POST', body })
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

const confirm = useConfirm()
async function remove(id: number) {
  if (!(await confirm())) return
  await $fetch(`/api/customers/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div>
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.customers')}`"
      :title="$t('nav.customers')"
      :subtitle="$t('customers.subtitle')"
    >
      <template #actions>
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('customers.add') }}
        </button>
      </template>
    </UiPageHead>

    <UiCard :flush="true">
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <EmptyState
        v-else-if="!customers.length"
        icon="i-lucide-users"
        :title="$t('customers.emptyTitle')"
        :description="$t('customers.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="openCreate">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('customers.add') }}
          </button>
        </template>
      </EmptyState>
      <template v-else>
        <div class="cust-toolbar">
          <UiSegmentedControl v-model="filter" :options="filterOptions" />
          <div class="cust-toolbar__spacer" />
          <USelect
            v-model="sortKey"
            :items="sortItems"
            value-key="value"
            class="cust-sort"
            :aria-label="$t('customers.sortLabel')"
            icon="i-lucide-arrow-up-down"
          />
        </div>

        <div class="ed-scroll">
          <table class="ed-table">
            <thead>
              <tr>
                <th>{{ $t('customers.colCustomer') }}</th>
                <th>{{ $t('customers.colNumber') }}</th>
                <th>{{ $t('customers.city') }}</th>
                <th>{{ $t('customers.paymentTerm') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!visibleRows.length" class="cust-empty-row">
                <td colspan="5">{{ $t('customers.noMatches') }}</td>
              </tr>
              <tr v-for="c in visibleRows" :key="c.id" class="row">
                <td>
                  <div class="cust">
                    <UAvatar :alt="c.name" size="2xs" />
                    <NuxtLink :to="`/customers/${c.id}`" class="cust-name">{{ c.name }}</NuxtLink>
                  </div>
                </td>
                <td class="mono">{{ c.customer_number || '—' }}</td>
                <td>{{ c.city || '—' }}</td>
                <td class="mono">{{ $t('customers.days', { n: c.payment_term_days }) }}</td>
                <td class="actions">
                  <button
                    class="icon-btn"
                    type="button"
                    :aria-label="`${$t('customers.edit')} — ${c.name}`"
                    @click="openEdit(c.id)"
                  >
                    <UIcon name="i-lucide-pencil" />
                  </button>
                  <button
                    class="icon-btn danger"
                    type="button"
                    :aria-label="`${$t('common.delete')} — ${c.name}`"
                    @click="remove(c.id)"
                  >
                    <UIcon name="i-lucide-trash-2" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </UiCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('customers.edit') : $t('customers.add')"
      :ui="{ content: 'max-w-full sm:max-w-xl' }"
    >
      <template #body>
        <UForm
          ref="formRef"
          :state="form"
          :validate="validate"
          :validate-on="['input', 'blur']"
          novalidate
          class="space-y-6"
          @submit="save"
        >
          <div class="space-y-3">
            <h3 class="eyebrow">{{ $t('customers.details') }}</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="$t('common.type')">
                <USelect v-model="form.type" :items="typeItems" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.language')">
                <USelect v-model="form.language" :items="languageItems" class="w-full" />
              </UFormField>
              <UFormField
                name="name"
                :label="form.type === 'company' ? $t('customers.companyName') : $t('common.name')"
                class="sm:col-span-2"
              >
                <UInput v-model="form.name" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.contactPerson')">
                <UInput v-model="form.contactPerson" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.customerNumber')">
                <UInput v-model="form.customerNumber" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="eyebrow">{{ $t('customers.secContact') }}</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField name="email" :label="$t('customers.email')"
                ><UInput v-model="form.email" inputmode="email" autocomplete="email" class="w-full"
              /></UFormField>
              <UFormField name="phone" :label="$t('customers.phone')"
                ><UInput v-model="form.phone" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.website')"
                ><UInput v-model="form.website" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.social')"
                ><UInput v-model="form.social" class="w-full"
              /></UFormField>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="eyebrow">{{ $t('customers.secAddress') }}</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField name="street" :label="$t('customers.street')" class="sm:col-span-2"
                ><UInput v-model="form.street" class="w-full"
              /></UFormField>
              <UFormField name="zip" :label="$t('customers.zip')"
                ><UInput v-model="form.zip" class="w-full"
              /></UFormField>
              <UFormField name="city" :label="$t('customers.city')"
                ><UInput v-model="form.city" class="w-full"
              /></UFormField>
              <UFormField name="country" :label="$t('customers.country')"
                ><UInput v-model="form.country" class="w-full"
              /></UFormField>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="eyebrow">{{ $t('customers.secBilling') }}</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="$t('customers.priceCategory')"
                ><UInput v-model="form.priceCategory" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.discountPercent')"
                ><UInput
                  v-model.number="form.discountPercent"
                  type="number"
                  min="0"
                  step="0.1"
                  class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.paymentTermDays')"
                ><UInput v-model.number="form.paymentTermDays" type="number" min="0" class="w-full"
              /></UFormField>
            </div>
          </div>

          <div v-if="form.type === 'company'" class="space-y-3">
            <h3 class="eyebrow">{{ $t('customers.secBusiness') }}</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="$t('customers.uid')"
                ><UInput v-model="form.uid" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.mwstNumber')"
                ><UInput v-model="form.mwst" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.hrNumber')"
                ><UInput v-model="form.hrNumber" class="w-full"
              /></UFormField>
              <UFormField :label="$t('customers.foundingYear')"
                ><UInput v-model.number="form.foundingYear" type="number" class="w-full"
              /></UFormField>
            </div>
          </div>
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
