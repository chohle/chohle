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

const { t } = useI18n()
const { data: customers, refresh } = await useFetch<CustomerRow[]>('/api/customers', {
  default: () => []
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
function validate(state: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!state.name.trim()) errors.push({ name: 'name', message: t('validation.required') })
  return errors
}

async function save() {
  saving.value = true
  try {
    const { id, ...body } = form
    if (id) {
      await $fetch(`/api/customers/${id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/customers', { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await $fetch(`/api/customers/${id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.customers')" :description="$t('customers.subtitle')" />

    <UCard>
      <div class="flex justify-end mb-4">
        <UButton icon="i-lucide-plus" @click="openCreate">{{ $t('customers.add') }}</UButton>
      </div>

      <EmptyState
        v-if="!customers.length"
        icon="i-lucide-users"
        :title="$t('customers.emptyTitle')"
        :description="$t('customers.emptyText')"
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[600px] text-sm">
        <thead class="text-muted text-left">
          <tr class="border-b border-default">
            <th class="py-2 font-medium">{{ $t('customers.colCustomer') }}</th>
            <th class="py-2 font-medium">{{ $t('customers.colNumber') }}</th>
            <th class="py-2 font-medium">{{ $t('customers.city') }}</th>
            <th class="py-2 font-medium">{{ $t('customers.paymentTerm') }}</th>
            <th class="py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in customers"
            :key="c.id"
            class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
          >
            <td class="py-2">
              <div class="flex items-center gap-2">
                <UAvatar :alt="c.name" size="2xs" />
                <NuxtLink :to="`/customers/${c.id}`" class="hover:underline">{{ c.name }}</NuxtLink>
              </div>
            </td>
            <td class="py-2">{{ c.customer_number || '-' }}</td>
            <td class="py-2">{{ c.city || '-' }}</td>
            <td class="py-2">{{ $t('customers.days', { n: c.payment_term_days }) }}</td>
            <td class="py-2 text-right whitespace-nowrap">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="openEdit(c.id)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                @click="remove(c.id)"
              />
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('customers.edit') : $t('customers.add')"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <UForm ref="formRef" :state="form" :validate="validate" class="space-y-6" @submit="save">
          <div class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('customers.details') }}</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField :label="$t('common.type')">
                <USelect v-model="form.type" :items="typeItems" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.language')">
                <USelect v-model="form.language" :items="languageItems" class="w-full" />
              </UFormField>
              <UFormField name="name" :label="form.type === 'company' ? $t('customers.companyName') : $t('common.name')" class="sm:col-span-2">
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
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('customers.secContact') }}</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField :label="$t('customers.email')">
                <UInput v-model="form.email" type="email" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.phone')">
                <UInput v-model="form.phone" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.website')">
                <UInput v-model="form.website" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.social')">
                <UInput v-model="form.social" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('customers.secAddress') }}</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField :label="$t('customers.street')" class="sm:col-span-2">
                <UInput v-model="form.street" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.zip')">
                <UInput v-model="form.zip" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.city')">
                <UInput v-model="form.city" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.country')">
                <UInput v-model="form.country" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('customers.secBilling') }}</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField :label="$t('customers.priceCategory')">
                <UInput v-model="form.priceCategory" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.discountPercent')">
                <UInput v-model.number="form.discountPercent" type="number" min="0" step="0.1" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.paymentTermDays')">
                <UInput v-model.number="form.paymentTermDays" type="number" min="0" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div v-if="form.type === 'company'" class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $t('customers.secBusiness') }}</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField :label="$t('customers.uid')">
                <UInput v-model="form.uid" placeholder="CHE-123.456.789" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.mwstNumber')">
                <UInput v-model="form.mwst" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.hrNumber')">
                <UInput v-model="form.hrNumber" class="w-full" />
              </UFormField>
              <UFormField :label="$t('customers.foundingYear')">
                <UInput v-model.number="form.foundingYear" type="number" class="w-full" />
              </UFormField>
            </div>
          </div>
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