<script setup lang="ts">
interface Customer {
  id: number
  type: 'person' | 'company'
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string
  language: string
  customer_number: string | null
  price_category: string | null
  discount_percent: number
  payment_term_days: number
  website: string | null
  founding_year: number | null
  social: string | null
  uid: string | null
  mwst: string | null
  hr_number: string | null
}

interface Rate {
  article_id: number
  name: string
  unit: string
  default_price_rappen: number
  override_rappen: number | null
}

const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const { data: customer } = await useFetch<Customer>(`/api/customers/${id}`)
const { data: rates, refresh: refreshRates } = await useFetch<Rate[]>(
  `/api/customers/${id}/rates`,
  { default: () => [] }
)

const edits = ref<Record<number, string>>({})
watchEffect(() => {
  const m: Record<number, string> = {}
  for (const r of rates.value) {
    m[r.article_id] = r.override_rappen != null ? String(r.override_rappen / 100) : ''
  }
  edits.value = m
})

const savingRates = ref(false)
async function saveRates() {
  savingRates.value = true
  try {
    const payload = rates.value.map((r) => ({
      articleId: r.article_id,
      price: edits.value[r.article_id] === '' ? null : Number(edits.value[r.article_id])
    }))
    await $fetch(`/api/customers/${id}/rates`, { method: 'PUT', body: { rates: payload } })
    await refreshRates()
    toast.add({ title: 'Rates saved', color: 'success' })
  } finally {
    savingRates.value = false
  }
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const details = computed(() => {
  const c = customer.value
  if (!c) return []
  const address = [c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country]
    .filter(Boolean)
    .join(', ')
  return (
    [
      ['Contact person', c.contact_person],
      ['Email', c.email],
      ['Phone', c.phone],
      ['Website', c.website],
      ['Social', c.social],
      ['Address', address],
      ['Customer number', c.customer_number],
      ['Language', c.language],
      ['Price category', c.price_category],
      ['Discount', c.discount_percent ? `${c.discount_percent}%` : null],
      ['Payment term', `${c.payment_term_days} days`],
      ['UID', c.uid],
      ['MWST', c.mwst],
      ['HR number', c.hr_number],
      ['Founding year', c.founding_year]
    ] as [string, unknown][]
  ).filter(([, v]) => v !== null && v !== undefined && v !== '')
})
</script>

<template>
  <div v-if="customer" class="max-w-3xl">
    <NuxtLink to="/customers" class="text-sm text-muted hover:underline">&larr; Customers</NuxtLink>

    <div class="flex items-center gap-3 mt-2">
      <UAvatar :alt="customer.name" />
      <div>
        <h1 class="text-2xl font-bold">{{ customer.name }}</h1>
        <UBadge :color="customer.type === 'company' ? 'primary' : 'neutral'" variant="subtle">
          {{ customer.type === 'company' ? 'Company' : 'Private person' }}
        </UBadge>
      </div>
    </div>

    <UCard class="mt-6">
      <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div v-for="[label, value] in details" :key="label" class="flex flex-col">
          <dt class="text-muted text-xs">{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Rates</h2>
          <UButton size="sm" :loading="savingRates" :disabled="!rates.length" @click="saveRates">
            Save rates
          </UButton>
        </div>
      </template>

      <p v-if="!rates.length" class="text-muted text-sm">
        No articles yet. Add articles first to set per-customer rates.
      </p>
      <table v-else class="w-full text-sm">
        <thead class="text-muted text-left">
          <tr class="border-b border-default">
            <th class="py-2 font-medium">Article</th>
            <th class="py-2 font-medium text-right">Default</th>
            <th class="py-2 font-medium text-right">This customer (CHF)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rates" :key="r.article_id" class="border-b border-default last:border-0">
            <td class="py-2">{{ r.name }}<span v-if="r.unit" class="text-muted"> / {{ r.unit }}</span></td>
            <td class="py-2 text-right whitespace-nowrap">CHF {{ chf(r.default_price_rappen) }}</td>
            <td class="py-2 text-right">
              <UInput
                v-model="edits[r.article_id]"
                type="number"
                min="0"
                step="0.05"
                :placeholder="chf(r.default_price_rappen)"
                class="w-28"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">Invoices</h2>
      </template>
      <p class="text-muted text-sm">Invoices for this customer will appear here.</p>
    </UCard>
  </div>
</template>
