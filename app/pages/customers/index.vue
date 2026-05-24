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

const { data: customers, refresh } = await useFetch<CustomerRow[]>('/api/customers', {
  default: () => []
})

const typeItems = [
  { label: 'Company', value: 'company' },
  { label: 'Private person', value: 'person' }
]
const languageItems = [
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Italian', value: 'it' },
  { label: 'English', value: 'en' }
]

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

async function save() {
  if (!form.name.trim()) return
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
  <div class="max-w-4xl">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">Customers</h1>
        <p class="text-muted mt-1">Your customer book.</p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">Add customer</UButton>
    </div>

    <UCard class="mt-6">
      <p v-if="!customers.length" class="text-muted text-sm">No customers yet.</p>
      <table v-else class="w-full text-sm">
        <thead class="text-muted text-left">
          <tr class="border-b border-default">
            <th class="py-2 font-medium">Customer</th>
            <th class="py-2 font-medium">Number</th>
            <th class="py-2 font-medium">City</th>
            <th class="py-2 font-medium">Payment term</th>
            <th class="py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in customers" :key="c.id" class="border-b border-default last:border-0">
            <td class="py-2">
              <div class="flex items-center gap-2">
                <UAvatar :alt="c.name" size="2xs" />
                <NuxtLink :to="`/customers/${c.id}`" class="hover:underline">{{ c.name }}</NuxtLink>
              </div>
            </td>
            <td class="py-2">{{ c.customer_number || '-' }}</td>
            <td class="py-2">{{ c.city || '-' }}</td>
            <td class="py-2">{{ c.payment_term_days }} days</td>
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
    </UCard>

    <UModal
      v-model:open="open"
      :title="form.id ? 'Edit customer' : 'Add customer'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <form class="space-y-5" @submit.prevent="save">
          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField label="Type">
              <USelect v-model="form.type" :items="typeItems" class="w-full" />
            </UFormField>
            <UFormField label="Language">
              <USelect v-model="form.language" :items="languageItems" class="w-full" />
            </UFormField>
            <UFormField :label="form.type === 'company' ? 'Company name' : 'Name'" class="sm:col-span-2">
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField label="Contact person">
              <UInput v-model="form.contactPerson" class="w-full" />
            </UFormField>
            <UFormField label="Customer number">
              <UInput v-model="form.customerNumber" class="w-full" />
            </UFormField>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField label="Email">
              <UInput v-model="form.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Phone">
              <UInput v-model="form.phone" class="w-full" />
            </UFormField>
            <UFormField label="Website">
              <UInput v-model="form.website" class="w-full" />
            </UFormField>
            <UFormField label="Social">
              <UInput v-model="form.social" class="w-full" />
            </UFormField>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField label="Street" class="sm:col-span-2">
              <UInput v-model="form.street" class="w-full" />
            </UFormField>
            <UFormField label="ZIP">
              <UInput v-model="form.zip" class="w-full" />
            </UFormField>
            <UFormField label="City">
              <UInput v-model="form.city" class="w-full" />
            </UFormField>
            <UFormField label="Country">
              <UInput v-model="form.country" class="w-full" />
            </UFormField>
          </div>

          <div class="grid sm:grid-cols-3 gap-4">
            <UFormField label="Price category">
              <UInput v-model="form.priceCategory" class="w-full" />
            </UFormField>
            <UFormField label="Discount %">
              <UInput v-model.number="form.discountPercent" type="number" min="0" step="0.1" class="w-full" />
            </UFormField>
            <UFormField label="Payment term (days)">
              <UInput v-model.number="form.paymentTermDays" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <div v-if="form.type === 'company'" class="border-t border-default pt-5">
            <h3 class="font-semibold mb-3">Business details</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <UFormField label="UID">
                <UInput v-model="form.uid" placeholder="CHE-123.456.789" class="w-full" />
              </UFormField>
              <UFormField label="MWST number">
                <UInput v-model="form.mwst" class="w-full" />
              </UFormField>
              <UFormField label="HR number">
                <UInput v-model="form.hrNumber" class="w-full" />
              </UFormField>
              <UFormField label="Founding year">
                <UInput v-model.number="form.foundingYear" type="number" class="w-full" />
              </UFormField>
            </div>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>