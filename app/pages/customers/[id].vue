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
  logo_path: string | null
}

const route = useRoute()
const id = route.params.id as string

const { data: customer, refresh: refreshCustomer } = await useFetch<Customer>(
  `/api/customers/${id}`
)
const logoSrc = computed(() =>
  customer.value?.logo_path ? `/api/customers/${id}/logo?v=${customer.value.logo_path}` : null
)

interface InvoiceRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  total_rappen: number
}
const { data: invoices } = await useFetch<InvoiceRow[]>(`/api/customers/${id}/invoices`, {
  default: () => []
})
const { data: customerArticles } = await useFetch<{ id: number }[]>(
  `/api/customers/${id}/articles`,
  { default: () => [] }
)

const statusColor: Record<string, string> = { draft: 'neutral', sent: 'warning', paid: 'success' }

const stats = computed(() => {
  const list = invoices.value
  return {
    count: list.length,
    paid: list.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total_rappen, 0),
    outstanding: list.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total_rappen, 0)
  }
})

const tabItems = computed(() => [
  { label: 'Details', icon: 'i-lucide-id-card', slot: 'details' },
  {
    label: 'Articles',
    icon: 'i-lucide-package',
    slot: 'articles',
    badge: customerArticles.value.length || undefined
  },
  {
    label: 'Invoices',
    icon: 'i-lucide-file-text',
    slot: 'invoices',
    badge: invoices.value.length || undefined
  }
])

async function newInvoice() {
  const { id: invoiceId } = await $fetch<{ id: number }>(`/api/customers/${id}/invoices`, {
    method: 'POST'
  })
  await navigateTo(`/invoices/${invoiceId}`)
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
  <div v-if="customer">
    <PageHeader :title="customer.name" back-to="/customers" back-label="Customers">
      <template #leading>
        <UAvatar :alt="customer.name" :src="logoSrc ?? undefined" size="lg" />
      </template>
      <template #description>
        <UBadge :color="customer.type === 'company' ? 'primary' : 'neutral'" variant="subtle">
          {{ customer.type === 'company' ? 'Company' : 'Private person' }}
        </UBadge>
      </template>
      <template #actions>
        <UButton icon="i-lucide-plus" @click="newInvoice">New invoice</UButton>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-file-text" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">Invoices</div>
            <div class="text-xl font-semibold tabular-nums">{{ stats.count }}</div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-circle-check" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">Paid</div>
            <div class="text-xl font-semibold tabular-nums">CHF {{ chf(stats.paid) }}</div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-clock" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">Outstanding</div>
            <div class="text-xl font-semibold tabular-nums">CHF {{ chf(stats.outstanding) }}</div>
          </div>
        </div>
      </UCard>
    </div>

    <UTabs :items="tabItems" variant="link" class="w-full">
      <template #details>
        <UCard class="mt-4">
          <LogoUpload
            :src="logoSrc"
            :upload-url="`/api/customers/${id}/logo`"
            :remove-url="`/api/customers/${id}/logo`"
            class="mb-6 pb-6 border-b border-default"
            @changed="refreshCustomer"
          />
          <dl class="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div v-for="[label, value] in details" :key="label" class="flex flex-col">
              <dt class="text-muted text-xs">{{ label }}</dt>
              <dd>{{ value }}</dd>
            </div>
          </dl>
        </UCard>
      </template>

      <template #articles>
        <UCard class="mt-4">
          <ArticleManager
            :list-url="`/api/customers/${id}/articles`"
            :create-url="`/api/customers/${id}/articles`"
          />
        </UCard>
      </template>

      <template #invoices>
        <UCard class="mt-4">
          <EmptyState
            v-if="!invoices.length"
            :bordered="false"
            icon="i-lucide-file-text"
            title="No invoices yet"
            description="Create the first invoice for this customer."
          >
            <template #action>
              <UButton icon="i-lucide-plus" @click="newInvoice">New invoice</UButton>
            </template>
          </EmptyState>
          <ul v-else class="divide-y divide-default -my-2">
            <li v-for="inv in invoices" :key="inv.id" class="flex items-center gap-3 py-3">
              <NuxtLink :to="`/invoices/${inv.id}`" class="flex-1 min-w-0 hover:underline">
                <span class="font-medium">{{ inv.number }}</span>
                <span class="text-muted"> · {{ inv.title || 'Untitled' }}</span>
              </NuxtLink>
              <UBadge :color="statusColor[inv.status]" variant="subtle" size="sm">
                {{ inv.status }}
              </UBadge>
              <span class="text-sm whitespace-nowrap tabular-nums">CHF {{ chf(inv.total_rappen) }}</span>
            </li>
          </ul>
        </UCard>
      </template>
    </UTabs>
  </div>
</template>
