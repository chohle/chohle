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

const { t } = useI18n()
const route = useRoute()
const id = route.params.id as string

const { data: customer, refresh: refreshCustomer } = await useFetch<Customer>(`/api/customers/${id}`)
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
const { data: invoices } = await useFetch<InvoiceRow[]>(`/api/customers/${id}/invoices`, { default: () => [] })
const { data: customerArticles } = await useFetch<{ id: number }[]>(
  `/api/customers/${id}/articles`,
  { default: () => [] }
)

const stats = computed(() => {
  const list = invoices.value
  return {
    count: list.length,
    paid: list.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total_rappen, 0),
    outstanding: list.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total_rappen, 0),
    total: list.reduce((s, i) => s + i.total_rappen, 0)
  }
})

const tab = ref<'details' | 'articles' | 'invoices'>('details')
const tabOptions = computed(() => [
  { value: 'details', label: t('customers.details') },
  { value: 'articles', label: t('nav.articles') },
  { value: 'invoices', label: t('customers.invoices') }
])

async function newInvoice() {
  const { id: invoiceId } = await $fetch<{ id: number }>(`/api/customers/${id}/invoices`, { method: 'POST' })
  await navigateTo(`/invoices/${invoiceId}`)
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const details = computed(() => {
  const c = customer.value
  if (!c) return []
  const address = [c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ')
  return ([
    [t('customers.contactPerson'), c.contact_person],
    [t('customers.email'), c.email],
    [t('customers.phone'), c.phone],
    [t('customers.website'), c.website],
    [t('customers.social'), c.social],
    [t('customers.address'), address],
    [t('customers.customerNumber'), c.customer_number],
    [t('customers.language'), c.language ? t(`languages.${c.language}`) : null],
    [t('customers.priceCategory'), c.price_category],
    [t('customers.discount'), c.discount_percent ? `${c.discount_percent}%` : null],
    [t('customers.paymentTerm'), t('customers.days', { n: c.payment_term_days })],
    [t('customers.uid'), c.uid],
    [t('common.vat'), c.mwst],
    [t('customers.hrNumber'), c.hr_number],
    [t('customers.foundingYear'), c.founding_year]
  ] as [string, unknown][]).filter(([, v]) => v !== null && v !== undefined && v !== '')
})
</script>

<template>
  <div v-if="customer" class="page-customer-detail">
    <NuxtLink to="/customers" class="page-customer-detail__back">
      <UIcon name="i-lucide-arrow-left" class="size-3.5" />
      <span class="mono">Customers</span>
    </NuxtLink>

    <header class="page-customer-detail__head">
      <UAvatar :alt="customer.name" :src="logoSrc ?? undefined" size="xl" />
      <div class="page-customer-detail__meta">
        <h1 class="page-customer-detail__name">{{ customer.name }}</h1>
        <div class="page-customer-detail__meta-row mono">
          <span>{{ customer.type === 'company' ? t('customers.typeCompany') : t('customers.typePerson') }}</span>
          <span v-if="customer.city">· {{ customer.city }}</span>
        </div>
      </div>
      <div class="page-customer-detail__actions">
        <a v-if="customer.email" class="ed-btn" :href="`mailto:${customer.email}`">
          <UIcon name="i-lucide-mail" class="size-3.5" /> Email
        </a>
        <button class="ed-btn-primary" @click="newInvoice">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ t('customers.newInvoice') }}
        </button>
      </div>
    </header>

    <UiKpiRow :cols="4">
      <UiKpiCell label="Total billed" currency="CHF" :value="chf(stats.total)" />
      <UiKpiCell label="Paid" currency="CHF" :value="chf(stats.paid)" />
      <UiKpiCell label="Outstanding" currency="CHF" :value="chf(stats.outstanding)" />
      <UiKpiCell label="Invoices" :value="String(stats.count)" />
    </UiKpiRow>

    <div class="page-customer-detail__tabs">
      <UiSegmentedControl v-model="tab" :options="tabOptions" />
    </div>

    <UiCard v-if="tab === 'details'">
      <LogoUpload
        :src="logoSrc"
        :upload-url="`/api/customers/${id}/logo`"
        :remove-url="`/api/customers/${id}/logo`"
        class="page-customer-detail__logo"
        @changed="refreshCustomer"
      />
      <dl class="page-customer-detail__dl">
        <div v-for="[label, value] in details" :key="label" class="page-customer-detail__dl-item">
          <dt class="eyebrow">{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
    </UiCard>

    <UiCard v-else-if="tab === 'articles'">
      <ArticleManager
        :list-url="`/api/customers/${id}/articles`"
        :create-url="`/api/customers/${id}/articles`"
      />
    </UiCard>

    <UiCard v-else-if="tab === 'invoices'">
      <div v-if="invoices.length" class="page-customer-detail__inv-head">
        <div class="eyebrow">{{ invoices.length }} {{ $t('customers.invoices') }}</div>
        <button class="ed-btn-primary" @click="newInvoice">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('customers.newInvoice') }}
        </button>
      </div>
      <EmptyState
        v-if="!invoices.length"
        :bordered="false"
        icon="i-lucide-file-text"
        :title="$t('customers.noInvoicesTitle')"
        :description="$t('customers.noInvoicesText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="newInvoice">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('customers.newInvoice') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="ed-scroll"><table class="ed-table page-customer-detail__inv-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Title</th>
            <th>Status</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="inv in invoices"
            :key="inv.id"
            class="row"
            tabindex="0"
            role="button"
            :aria-label="`${inv.number || $t('common.untitled')} ${inv.title || ''}`.trim()"
            @click="navigateTo(`/invoices/${inv.id}`)"
            @keyup.enter="navigateTo(`/invoices/${inv.id}`)"
            @keyup.space.prevent="navigateTo(`/invoices/${inv.id}`)"
          >
            <td class="mono">{{ inv.number }}</td>
            <td>{{ inv.title || $t('common.untitled') }}</td>
            <td><UiOutlinedChip :status="inv.status as any">{{ $t(`status.${inv.status}`) }}</UiOutlinedChip></td>
            <td class="right mono">CHF {{ chf(inv.total_rappen) }}</td>
          </tr>
        </tbody>
      </table></div>
    </UiCard>
  </div>
</template>
