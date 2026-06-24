<script setup lang="ts">
interface PaymentRow {
  kind: 'invoice' | 'salary'
  id: number
  date: string
  amount_rappen: number
  label: string
  sub_label: string
  link?: string
}
interface Payload {
  year: number
  rows: PaymentRow[]
  total: number
}

const { locale } = useI18n()
const year = ref(new Date().getFullYear())
const { data, error, refresh } = await useFetch<Payload>('/api/payments', { query: { year } })

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}
function monthLabel(ym: string) {
  return new Date(`${ym}-01`).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
}

const grouped = computed(() => {
  const rows = data.value?.rows ?? []
  const groups = new Map<string, PaymentRow[]>()
  for (const r of rows) {
    const ym = r.date.slice(0, 7)
    if (!groups.has(ym)) groups.set(ym, [])
    groups.get(ym)!.push(r)
  }
  return [...groups.entries()].map(([ym, rows]) => ({
    ym,
    rows,
    total: rows.reduce((s, r) => s + r.amount_rappen, 0)
  }))
})

const invoiceTotal = computed(() =>
  (data.value?.rows ?? [])
    .filter((r) => r.kind === 'invoice')
    .reduce((s, r) => s + r.amount_rappen, 0)
)
const salaryTotal = computed(() =>
  (data.value?.rows ?? [])
    .filter((r) => r.kind === 'salary')
    .reduce((s, r) => s + r.amount_rappen, 0)
)
</script>

<template>
  <div class="page-payments">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.payments')}`"
      :title="$t('payments.title')"
      :subtitle="$t('payments.subtitle')"
    >
      <template #actions>
        <div class="year-pick">
          <button class="icon-btn" @click="year--"><UIcon name="i-lucide-chevron-left" /></button>
          <span class="mono">{{ data?.year ?? year }}</span>
          <button class="icon-btn" @click="year++"><UIcon name="i-lucide-chevron-right" /></button>
        </div>
      </template>
    </UiPageHead>

    <UiKpiRow :cols="3">
      <UiKpiCell
        :label="$t('payments.total')"
        currency="CHF"
        :value="chf(data?.total ?? 0)"
        inverted
      />
      <UiKpiCell :label="$t('payments.fromInvoices')" currency="CHF" :value="chf(invoiceTotal)" />
      <UiKpiCell :label="$t('payments.fromSalary')" currency="CHF" :value="chf(salaryTotal)" />
    </UiKpiRow>

    <UiSectionLabel>{{ $t('payments.allReceipts') }}</UiSectionLabel>

    <UiCard>
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <EmptyState
        v-else-if="!data || !data.rows.length"
        :bordered="false"
        icon="i-lucide-banknote"
        :title="$t('payments.emptyTitle')"
        :description="$t('payments.emptyText')"
      />
      <div v-else class="ed-scroll">
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('payments.colDate') }}</th>
              <th>{{ $t('payments.colSource') }}</th>
              <th class="right">{{ $t('payments.colAmount') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in grouped" :key="g.ym">
              <tr class="month-row">
                <td colspan="3">
                  <div class="month-bar">
                    <span class="mono ml">{{ monthLabel(g.ym) }}</span>
                    <span class="mono mr">CHF {{ chf(g.total) }}</span>
                  </div>
                </td>
              </tr>
              <tr v-for="r in g.rows" :key="`${r.kind}-${r.id}`" class="row">
                <td class="mono">{{ dateCh(r.date) }}</td>
                <td>
                  <div class="src">
                    <UIcon
                      :name="r.kind === 'invoice' ? 'i-lucide-file-text' : 'i-lucide-briefcase'"
                      class="size-3.5"
                    />
                    <div>
                      <component :is="r.link ? 'NuxtLink' : 'span'" :to="r.link" class="src-name">{{
                        r.label
                      }}</component>
                      <div class="src-sub mono">{{ r.sub_label }}</div>
                    </div>
                  </div>
                </td>
                <td class="right mono">CHF {{ chf(r.amount_rappen) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </UiCard>
  </div>
</template>
