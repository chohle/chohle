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

const statusColor = { draft: 'neutral', sent: 'warning', paid: 'success' } as const

const filter = ref<'all' | 'draft' | 'sent' | 'paid'>('all')
const filterItems = computed(() => [
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
const paidTotal = computed(() => sumBy('paid'))
const outstandingTotal = computed(() => sumBy('sent'))

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, { day: '2-digit', month: 'short', year: 'numeric' })
}
function open(id: number) {
  navigateTo(`/invoices/${id}`)
}
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.invoices')" :description="$t('invoices.allSubtitle')" />

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-file-text" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('customers.invoices') }}</div>
            <div class="text-xl font-semibold tabular-nums">{{ invoices.length }}</div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-circle-check" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('status.paid') }}</div>
            <div class="text-xl font-semibold tabular-nums">CHF {{ chf(paidTotal) }}</div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-clock" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('customers.outstanding') }}</div>
            <div class="text-xl font-semibold tabular-nums">CHF {{ chf(outstandingTotal) }}</div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <div class="flex flex-wrap gap-2 mb-4">
        <UButton
          v-for="f in filterItems"
          :key="f.value"
          size="xs"
          color="neutral"
          :variant="filter === f.value ? 'solid' : 'outline'"
          @click="filter = f.value as typeof filter"
        >
          {{ f.label }}
        </UButton>
      </div>

      <EmptyState
        v-if="!filtered.length"
        icon="i-lucide-file-text"
        :title="$t('invoices.emptyTitle')"
        :description="$t('invoices.emptyText')"
      >
        <template #action>
          <UButton icon="i-lucide-users" @click="navigateTo('/customers')">
            {{ $t('invoices.emptyCta') }}
          </UButton>
        </template>
      </EmptyState>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-sm">
          <thead class="text-muted text-left">
            <tr class="border-b border-default">
              <th class="py-2 font-medium">{{ $t('invoices.number') }}</th>
              <th class="py-2 font-medium">{{ $t('customers.colCustomer') }}</th>
              <th class="py-2 font-medium">{{ $t('common.title') }}</th>
              <th class="py-2 font-medium">{{ $t('invoices.issueDate') }}</th>
              <th class="py-2 font-medium">{{ $t('invoices.statusLabel') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('common.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="inv in filtered"
              :key="inv.id"
              tabindex="0"
              role="button"
              :aria-label="`${inv.number || inv.title || $t('common.untitled')}, ${inv.customer_name}`"
              class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              @click="open(inv.id)"
              @keydown.enter="open(inv.id)"
              @keydown.space.prevent="open(inv.id)"
            >
              <td class="py-2 font-medium whitespace-nowrap">{{ inv.number || '-' }}</td>
              <td class="py-2">{{ inv.customer_name }}</td>
              <td class="py-2 text-muted">{{ inv.title || $t('common.untitled') }}</td>
              <td class="py-2 whitespace-nowrap">{{ formatDate(inv.issue_date) }}</td>
              <td class="py-2">
                <UBadge :color="statusColor[inv.status]" variant="subtle" size="sm">
                  {{ $t(`status.${inv.status}`) }}
                </UBadge>
              </td>
              <td class="py-2 text-right whitespace-nowrap tabular-nums">CHF {{ chf(inv.total_rappen) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
