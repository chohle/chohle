<script setup lang="ts">
interface Summary {
  month: string
  income: number
  invoiceIncome: number
  expenses: number
  net: number
  expected: number
  outstanding: number
  byCategory: { name: string; color: string; icon: string; total: number }[]
  trend: { month: string; income: number; expenses: number }[]
  recurring: {
    company: string
    salary_rappen: number
    paid: boolean
    pay_date: string
    reason: string | null
  }[]
}

interface YearSummary {
  year: number
  months: { ym: string; income: number; expenses: number; net: number }[]
  totals: { income: number; expenses: number; net: number }
}

const { t, locale } = useI18n()
const { user } = useUserSession()
const username = computed(() => user.value?.username ?? 'there')
const month = ref(new Date().toISOString().slice(0, 7))
const year = ref(new Date().getFullYear())
const { data } = await useFetch<Summary>('/api/summary', { query: { month } })
const { data: yearData } = await useFetch<YearSummary>('/api/summary/year', { query: { year } })

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

const prevMonth = computed(() => {
  const t = data.value?.trend ?? []
  return t[t.length - 2]
})
function pctDelta(current: number, previous?: number) {
  if (previous == null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
function deltaText(d: number | null) {
  if (d == null) return ''
  return `${d >= 0 ? '+' : ''}${d}% vs last month`
}
const incomeDelta = computed(() => pctDelta(data.value?.income ?? 0, prevMonth.value?.income))
const expensesDelta = computed(() => pctDelta(data.value?.expenses ?? 0, prevMonth.value?.expenses))
const netDelta = computed(() => {
  const p = prevMonth.value
  return pctDelta(data.value?.net ?? 0, p ? p.income - p.expenses : undefined)
})

function monthLabel(ym: string) {
  return new Date(`${ym}-01`).toLocaleDateString(locale.value, { month: 'short' })
}

const sparkValues = computed(() =>
  (data.value?.trend ?? []).map((t) => Math.max(0, t.income - t.expenses))
)
const trendSeries = computed(() => [
  { values: (data.value?.trend ?? []).map((t) => t.income), weight: 1 as const },
  { values: (data.value?.trend ?? []).map((t) => t.expenses), weight: 3 as const }
])
const trendLabels = computed(() => (data.value?.trend ?? []).map((t) => monthLabel(t.month)))

const yearSeries = computed(() => [
  { values: (yearData.value?.months ?? []).map((m) => m.income), weight: 1 as const },
  { values: (yearData.value?.months ?? []).map((m) => m.expenses), weight: 3 as const }
])
const yearLabels = computed(() => (yearData.value?.months ?? []).map((m) => monthLabel(m.ym)))

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
})
</script>

<template>
  <div v-if="data" class="page-overview">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.dashboard')}`"
      :title="`${greeting}, ${username}.`"
    >
      <template #title>
        {{ greeting }}, <em class="page-overview__italic">{{ username }}</em
        >.
      </template>
      <template #subtitle>{{ $t('dashboard.subtitle') }}</template>
      <template #actions>
        <MonthSelect v-model="month" />
      </template>
    </UiPageHead>

    <UiHero
      :eyebrow="$t('dashboard.netHeroEyebrow')"
      currency="CHF"
      :value="chf(data.net)"
      :delta="deltaText(netDelta)"
    >
      <template #aside>
        <UiSparkline :values="sparkValues" :width="220" :height="42" />
      </template>
    </UiHero>

    <UiSubStrip>
      <UiSubStripItem
        :label="$t('dashboard.kpiFromCustomers')"
        currency="CHF"
        :value="chf(data.invoiceIncome || data.income)"
        :delta="deltaText(incomeDelta)"
      />
      <UiSubStripItem
        :label="$t('dashboard.kpiExpected')"
        currency="CHF"
        :value="chf(data.expected)"
        :delta="
          data.outstanding
            ? $t('dashboard.outstandingShort', { amount: chf(data.outstanding) })
            : ''
        "
      />
      <UiSubStripItem
        :label="$t('dashboard.kpiExpensesOut')"
        currency="CHF"
        :value="chf(data.expenses)"
        :delta="deltaText(expensesDelta)"
      />
    </UiSubStrip>

    <UiSectionLabel>{{ $t('dashboard.last6Months') }}</UiSectionLabel>

    <div class="page-overview__grid">
      <UiCard>
        <div class="page-overview__card-head">
          <div class="eyebrow">{{ $t('dashboard.incomeVsExpenses') }}</div>
          <div class="page-overview__legend mono">
            <span
              ><span class="page-overview__lg-dot page-overview__lg-dot--ink" />
              {{ $t('dashboard.income') }}</span
            >
            <span
              ><span class="page-overview__lg-dot page-overview__lg-dot--muted" />
              {{ $t('dashboard.expenses') }}</span
            >
          </div>
        </div>
        <UiBarChart :series="trendSeries" :labels="trendLabels" :stacked="false" :height="220" />
      </UiCard>

      <UiCard>
        <div class="page-overview__card-head">
          <div class="eyebrow">{{ $t('dashboard.recurringIncome') }}</div>
          <span class="mono page-overview__count">{{ data.recurring.length }}</span>
        </div>
        <EmptyState
          v-if="!data.recurring.length"
          :bordered="false"
          icon="i-lucide-banknote"
          :title="$t('dashboard.noIncomeTitle')"
          :description="$t('dashboard.noIncomeText')"
        />
        <UiNumberedList v-else>
          <li v-for="(r, i) in data.recurring" :key="r.company" class="item">
            <span class="num">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="main">
              <span class="title">{{ r.company }}</span>
              <span class="sub">{{ $t('dashboard.pays', { date: dateCh(r.pay_date) }) }}</span>
            </span>
            <span class="value">CHF {{ chf(r.salary_rappen) }}</span>
          </li>
        </UiNumberedList>
      </UiCard>
    </div>

    <UiSectionLabel v-if="yearData">{{
      $t('dashboard.cashflow', { year: yearData.year })
    }}</UiSectionLabel>

    <UiCard v-if="yearData">
      <div class="page-overview__card-head">
        <div class="page-overview__year-pick">
          <button class="icon-btn" @click="year--"><UIcon name="i-lucide-chevron-left" /></button>
          <span class="mono">{{ yearData.year }}</span>
          <button class="icon-btn" @click="year++"><UIcon name="i-lucide-chevron-right" /></button>
        </div>
        <div class="page-overview__yr-totals mono">
          <span
            >{{ $t('dashboard.income') }}
            <b class="tabular">CHF {{ chf(yearData.totals.income) }}</b></span
          >
          <span
            >{{ $t('dashboard.expenses') }}
            <b class="tabular">CHF {{ chf(yearData.totals.expenses) }}</b></span
          >
          <span
            >{{ $t('dashboard.net') }}
            <b class="tabular">CHF {{ chf(yearData.totals.net) }}</b></span
          >
        </div>
      </div>
      <UiBarChart :series="yearSeries" :labels="yearLabels" :stacked="false" :height="220" />
    </UiCard>
  </div>
</template>
