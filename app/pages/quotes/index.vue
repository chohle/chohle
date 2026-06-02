<script setup lang="ts">
interface QuoteRow {
  id: number
  number: string
  title: string
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  issue_date: string
  valid_until: string | null
  customer_id: number
  customer_name: string
  project_id: number | null
  project_name: string | null
  converted_invoice_id: number | null
  total_rappen: number
}

const { t } = useI18n()
const { data: quotes } = await useFetch<QuoteRow[]>('/api/quotes', {
  default: () => []
})

const filter = ref<'all' | 'draft' | 'sent' | 'accepted' | 'declined'>('all')
const filterOptions = computed(() => [
  { value: 'all', label: t('quotes.filterAll') },
  { value: 'draft', label: t('status.draft') },
  { value: 'sent', label: t('status.sent') },
  { value: 'accepted', label: t('status.accepted') },
  { value: 'declined', label: t('status.declined') }
])
const filtered = computed(() =>
  filter.value === 'all'
    ? (quotes.value ?? [])
    : (quotes.value ?? []).filter((q) => q.status === filter.value)
)

const sumBy = (status: string) =>
  (quotes.value ?? []).filter((q) => q.status === status).reduce((s, q) => s + q.total_rappen, 0)
const countBy = (status: string) => (quotes.value ?? []).filter((q) => q.status === status).length
const draftTotal = computed(() => sumBy('draft'))
const sentTotal = computed(() => sumBy('sent'))
const acceptedTotal = computed(() => sumBy('accepted'))

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}
function open(id: number) {
  navigateTo(`/quotes/${id}`)
}

// New-quote modal: pick a customer, POST, navigate to the editor.
// The project link (optional) is set later in the editor where the
// project picker has more room.
const newOpen = ref(false)
const newCustomerId = ref<number>()
const creating = ref(false)
const { data: customers } = await useFetch<Array<{ id: number; name: string }>>('/api/customers', {
  default: () => []
})
const customerOptions = computed(() =>
  (customers.value ?? []).map((c) => ({ label: c.name, value: c.id }))
)

function openCreate() {
  newCustomerId.value = undefined
  newOpen.value = true
}
async function submitCreate() {
  if (!newCustomerId.value) return
  creating.value = true
  try {
    const r = await $fetch<{ id: number }>('/api/quotes', {
      method: 'POST',
      body: { customerId: newCustomerId.value }
    })
    newOpen.value = false
    await navigateTo(`/quotes/${r.id}`)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page-quotes">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.quotes')}`"
      :title="$t('nav.quotes')"
      :subtitle="$t('quotes.allSubtitle')"
    >
      <template #actions>
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('quotes.newQuote') }}
        </button>
      </template>
    </UiPageHead>

    <UiKpiRow>
      <UiKpiCell
        :label="$t('quotes.kpiDraft')"
        currency="CHF"
        :value="chf(draftTotal)"
        :delta="$t('quotes.deltaCount', { n: countBy('draft') })"
      />
      <UiKpiCell
        :label="$t('quotes.kpiSent')"
        currency="CHF"
        :value="chf(sentTotal)"
        :delta="$t('quotes.deltaCount', { n: countBy('sent') })"
      />
      <UiKpiCell
        :label="$t('quotes.kpiAccepted')"
        currency="CHF"
        :value="chf(acceptedTotal)"
        :delta="$t('quotes.deltaCount', { n: countBy('accepted') })"
      />
      <UiKpiCell
        :label="$t('quotes.kpiAll')"
        currency="CHF"
        :value="chf(draftTotal + sentTotal + acceptedTotal)"
        :delta="$t('quotes.deltaAll', { n: (quotes ?? []).length })"
      />
    </UiKpiRow>

    <div class="page-quotes__filter-row">
      <UiSegmentedControl v-model="filter" :options="filterOptions" />
    </div>

    <UiCard>
      <EmptyState
        v-if="!filtered.length"
        :bordered="false"
        icon="i-lucide-file-text"
        :title="$t('quotes.emptyTitle')"
        :description="$t('quotes.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="openCreate">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('quotes.newQuote') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="ed-scroll">
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('quotes.number') }}</th>
              <th>{{ $t('customers.colCustomer') }}</th>
              <th>{{ $t('common.title') }}</th>
              <th>{{ $t('invoices.projectCol') }}</th>
              <th>{{ $t('quotes.issueDate') }}</th>
              <th>{{ $t('quotes.validUntil') }}</th>
              <th>{{ $t('quotes.statusLabel') }}</th>
              <th class="right">{{ $t('common.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="q in filtered"
              :key="q.id"
              tabindex="0"
              role="button"
              class="row"
              @click="open(q.id)"
              @keydown.enter="open(q.id)"
              @keydown.space.prevent="open(q.id)"
            >
              <td class="mono">{{ q.number || '—' }}</td>
              <td>{{ q.customer_name }}</td>
              <td class="page-quotes__muted">{{ q.title || $t('common.untitled') }}</td>
              <td class="page-quotes__muted">
                <span v-if="q.project_name">{{ q.project_name }}</span>
                <span v-else>—</span>
              </td>
              <td class="mono">{{ dateCh(q.issue_date) }}</td>
              <td class="mono page-quotes__muted">
                {{ q.valid_until ? dateCh(q.valid_until) : '—' }}
              </td>
              <td>
                <UiOutlinedChip
                  :status="
                    q.status === 'accepted' ? 'paid' : q.status === 'declined' ? 'draft' : q.status
                  "
                >
                  {{ $t(`status.${q.status}`) }}
                </UiOutlinedChip>
              </td>
              <td class="right mono">CHF {{ chf(q.total_rappen) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UModal v-model:open="newOpen" :title="$t('quotes.newQuote')">
      <template #body>
        <form class="mt-3 flex flex-col gap-3" novalidate @submit.prevent="submitCreate">
          <UFormField :label="$t('customers.colCustomer')">
            <USelect
              v-model="newCustomerId"
              :items="customerOptions"
              :placeholder="$t('quotes.pickCustomer')"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="newOpen = false">{{ $t('common.cancel') }}</button>
          <button
            class="ed-btn-primary"
            :disabled="creating || !newCustomerId"
            @click="submitCreate"
          >
            <UIcon name="i-lucide-plus" class="size-3.5" />
            {{ $t('quotes.create') }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style lang="scss" scoped>
.page-quotes__muted {
  color: var(--ink-3);
}
.page-quotes__filter-row {
  margin: 4px 0;
}
// Rows open the quote on click — pointer cursor so the hover reads as clickable.
.page-quotes :deep(.ed-table tbody tr.row) {
  cursor: pointer;
}
</style>
