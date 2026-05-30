<script setup lang="ts">
interface InvoiceRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'paid'
  issue_date: string
  customer_id: number
  customer_name: string
  total_rappen: number
}

const { t, locale } = useI18n()
const { data: invoices } = await useFetch<InvoiceRow[]>('/api/invoices', { default: () => [] })

const filter = ref<'all' | 'draft' | 'sent' | 'paid'>('all')
const filterOptions = computed(() => [
  { value: 'all', label: t('invoices.filterAll') },
  { value: 'draft', label: t('status.draft') },
  { value: 'sent', label: t('status.sent') },
  { value: 'paid', label: t('status.paid') }
])
const filtered = computed(() =>
  filter.value === 'all' ? invoices.value : invoices.value.filter((i) => i.status === filter.value)
)

const sumBy = (status: string) =>
  invoices.value.filter((i) => i.status === status).reduce((s, i) => s + i.total_rappen, 0)
const countBy = (status: string) => invoices.value.filter((i) => i.status === status).length
const paidTotal = computed(() => sumBy('paid'))
const sentTotal = computed(() => sumBy('sent'))
const draftTotal = computed(() => sumBy('draft'))

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function open(id: number) {
  navigateTo(`/invoices/${id}`)
}
</script>

<template>
  <div class="page-invoices">
    <UiPageHead :crumb="`${$t('nav.workspace')} / ${$t('nav.invoices')}`" :title="$t('nav.invoices')" :subtitle="$t('invoices.allSubtitle')">
      <template #actions>
        <button class="ed-btn" @click="navigateTo('/customers')">
          <UIcon name="i-lucide-users" class="size-3.5" /> {{ $t('invoices.emptyCta') }}
        </button>
      </template>
    </UiPageHead>

    <UiKpiRow>
      <UiKpiCell :label="$t('invoices.kpiPaid')" currency="CHF" :value="chf(paidTotal)" :delta="$t('invoices.deltaCount', { n: countBy('paid') })" />
      <UiKpiCell :label="$t('invoices.kpiSentAwaiting')" currency="CHF" :value="chf(sentTotal)" :delta="$t('invoices.deltaCount', { n: countBy('sent') })" />
      <UiKpiCell :label="$t('invoices.kpiDrafts')" currency="CHF" :value="chf(draftTotal)" :delta="$t('invoices.deltaDrafts', { n: countBy('draft') })" />
      <UiKpiCell :label="$t('invoices.kpiTotal')" currency="CHF" :value="chf(paidTotal + sentTotal + draftTotal)" :delta="$t('invoices.deltaAll', { n: invoices.length })" />
    </UiKpiRow>

    <div class="page-invoices__filter-row">
      <UiSegmentedControl v-model="filter" :options="filterOptions" />
    </div>

    <UiCard>
      <EmptyState
        v-if="!filtered.length"
        :bordered="false"
        icon="i-lucide-file-text"
        :title="$t('invoices.emptyTitle')"
        :description="$t('invoices.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="navigateTo('/customers')">
            <UIcon name="i-lucide-users" class="size-3.5" /> {{ $t('invoices.emptyCta') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="ed-scroll"><table class="ed-table">
        <thead>
          <tr>
            <th>{{ $t('invoices.number') }}</th>
            <th>{{ $t('customers.colCustomer') }}</th>
            <th>{{ $t('common.title') }}</th>
            <th>{{ $t('invoices.issueDate') }}</th>
            <th>{{ $t('invoices.statusLabel') }}</th>
            <th class="right">{{ $t('common.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="inv in filtered"
            :key="inv.id"
            tabindex="0"
            role="button"
            class="row"
            @click="open(inv.id)"
            @keydown.enter="open(inv.id)"
            @keydown.space.prevent="open(inv.id)"
          >
            <td class="mono">{{ inv.number || '—' }}</td>
            <td>{{ inv.customer_name }}</td>
            <td class="page-invoices__muted">{{ inv.title || $t('common.untitled') }}</td>
            <td class="mono">{{ dateCh(inv.issue_date) }}</td>
            <td><UiOutlinedChip :status="inv.status">{{ $t(`status.${inv.status}`) }}</UiOutlinedChip></td>
            <td class="right mono">CHF {{ chf(inv.total_rappen) }}</td>
          </tr>
        </tbody>
      </table></div>
    </UiCard>
  </div>
</template>

