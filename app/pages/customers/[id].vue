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

interface ProjectRow {
  id: number
  name: string
  direction: 'sales' | 'procurement'
  stage: string
  label: string
  budget_rappen: number
  budget_type: string
  updated_at: string
  email_count: number
  invoice_count: number
  invoiced_rappen: number
  paid_rappen: number
}
const { data: projects } = await useFetch<ProjectRow[]>(`/api/customers/${id}/projects`, { default: () => [] })

const DIR_TO_SLUG: Record<'sales' | 'procurement', string> = { sales: 'vertrieb', procurement: 'einkauf' }

const stats = computed(() => {
  const list = invoices.value
  return {
    count: list.length,
    paid: list.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total_rappen, 0),
    outstanding: list.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total_rappen, 0),
    total: list.reduce((s, i) => s + i.total_rappen, 0)
  }
})

const tab = ref<'details' | 'articles' | 'projects'>('details')
const tabOptions = computed(() => [
  { value: 'details', label: t('customers.details') },
  { value: 'articles', label: t('nav.articles') },
  { value: 'projects', label: t('customers.projectsTab') }
])

// Invoice creation always goes through a project now. The picker either
// reuses an existing project for this customer or creates a new one with
// name + budget, then the project drives the invoice draft.
const pickerOpen = ref(false)
const creatingInvoice = ref(false)

function openInvoicePicker() {
  pickerOpen.value = true
}

const toast = useToast()
async function onProjectResolved(projectId: number) {
  pickerOpen.value = false
  creatingInvoice.value = true
  try {
    const { id: invoiceId } = await $fetch<{ id: number }>(
      `/api/projects/${projectId}/invoices`, { method: 'POST' }
    )
    await navigateTo(`/invoices/${invoiceId}`)
  } catch (err) {
    // Reopen the picker so the user can try again, surface what went wrong.
    pickerOpen.value = true
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('customers.invoiceCreateFailed')
    toast.add({ title: msg, color: 'error' })
  } finally { creatingInvoice.value = false }
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
        <button class="ed-btn-primary" :disabled="creatingInvoice" @click="openInvoicePicker">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ t('customers.newInvoice') }}
        </button>
      </div>
    </header>

    <UiKpiRow :cols="4">
      <UiKpiCell :label="$t('customers.kpiTotalBilled')" currency="CHF" :value="chf(stats.total)" />
      <UiKpiCell :label="$t('customers.kpiPaid')" currency="CHF" :value="chf(stats.paid)" />
      <UiKpiCell :label="$t('customers.outstanding')" currency="CHF" :value="chf(stats.outstanding)" />
      <UiKpiCell :label="$t('customers.invoices')" :value="String(stats.count)" />
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

    <UiCard v-else-if="tab === 'projects'">
      <EmptyState
        v-if="!projects.length"
        :bordered="false"
        icon="i-lucide-kanban"
        :title="$t('customers.noProjectsTitle')"
        :description="$t('customers.noProjectsText')"
      />
      <div v-else class="ed-scroll"><table class="ed-table">
        <thead>
          <tr>
            <th>{{ $t('common.name') }}</th>
            <th>{{ $t('pipeline.directionLabel') }}</th>
            <th>{{ $t('pipeline.stage.label') }}</th>
            <th class="right">{{ $t('pipeline.budget') }}</th>
            <th class="right">{{ $t('pipeline.detail.invoiced') }}</th>
            <th class="right">{{ $t('customers.projectsEmails') }}</th>
            <th>{{ $t('customers.projectsUpdated') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in projects"
            :key="p.id"
            class="row"
            tabindex="0"
            role="button"
            :aria-label="p.name"
            @click="navigateTo(`/${DIR_TO_SLUG[p.direction]}/${p.id}`)"
            @keyup.enter="navigateTo(`/${DIR_TO_SLUG[p.direction]}/${p.id}`)"
            @keyup.space.prevent="navigateTo(`/${DIR_TO_SLUG[p.direction]}/${p.id}`)"
          >
            <td>
              <div>{{ p.name }}</div>
              <div v-if="p.label" class="page-customer-detail__project-sub">{{ p.label }}</div>
            </td>
            <td class="mono">{{ p.direction === 'procurement' ? $t('pipeline.direction.procurement') : $t('pipeline.direction.sales') }}</td>
            <td class="mono">{{ $t(`pipeline.stage.${p.stage}`) }}</td>
            <td class="right mono">{{ p.budget_rappen > 0 ? `CHF ${chf(p.budget_rappen)}` : '—' }}</td>
            <td class="right mono">
              <span v-if="p.invoice_count">CHF {{ chf(p.invoiced_rappen) }} <span class="page-customer-detail__project-count">({{ p.invoice_count }})</span></span>
              <span v-else>—</span>
            </td>
            <td class="right mono">{{ p.email_count || '—' }}</td>
            <td class="mono">{{ dateCh(p.updated_at.slice(0, 10)) }}</td>
          </tr>
        </tbody>
      </table></div>
    </UiCard>

    <UiCard v-else-if="tab === 'articles'">
      <ArticleManager
        :list-url="`/api/customers/${id}/articles`"
        :create-url="`/api/customers/${id}/articles`"
      />
    </UiCard>

    <UModal v-model:open="pickerOpen" :title="$t('customers.newInvoice')">
      <template #body>
        <p class="page-customer-detail__picker-hint">{{ $t('customers.invoiceFromProjectHint') }}</p>
        <ProjectPicker
          :customer-id="Number(id)"
          :projects="projects.map(p => ({ id: p.id, name: p.name, stage: p.stage, budget_rappen: p.budget_rappen }))"
          @resolved="onProjectResolved"
          @cancel="pickerOpen = false"
        />
      </template>
    </UModal>
  </div>
</template>
