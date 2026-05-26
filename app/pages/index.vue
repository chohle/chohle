<script setup lang="ts">
interface Summary {
  month: string
  income: number
  invoiceIncome: number
  expenses: number
  net: number
  expected: number
  outstanding: number
  byCategory: { name: string, color: string, icon: string, total: number }[]
  trend: { month: string, income: number, expenses: number }[]
  recurring: { company: string, salary_rappen: number, paid: boolean, pay_date: string, reason: string | null }[]
}

const { locale } = useI18n()
const month = ref(new Date().toISOString().slice(0, 7))
const { data } = await useFetch<Summary>('/api/summary', { query: { month } })

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

const categoryTotal = computed(() =>
  (data.value?.byCategory ?? []).reduce((sum, c) => sum + c.total, 0)
)

const trendMax = computed(() =>
  Math.max(1, ...(data.value?.trend ?? []).flatMap((t) => [t.income, t.expenses]))
)

// Month-over-month change for the headline figures.
const prevMonth = computed(() => {
  const t = data.value?.trend ?? []
  return t[t.length - 2]
})
function pctDelta(current: number, previous?: number) {
  if (previous == null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
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

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div v-if="data">
    <PageHeader :title="$t('nav.dashboard')" :description="$t('dashboard.subtitle')">
      <template #actions>
        <MonthSelect v-model="month" />
      </template>
    </PageHeader>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-trending-up" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('dashboard.income') }}</div>
            <div class="text-xl font-semibold text-success tabular-nums">CHF {{ chf(data.income) }}</div>
            <div v-if="data.invoiceIncome" class="text-xs text-muted">
              {{ $t('dashboard.fromInvoices', { amount: chf(data.invoiceIncome) }) }}
            </div>
            <div
              v-else-if="incomeDelta !== null"
              class="mt-0.5 flex items-center gap-0.5 text-xs"
              :class="incomeDelta >= 0 ? 'text-success' : 'text-error'"
              :title="$t('dashboard.vsLastMonth')"
            >
              <UIcon :name="incomeDelta >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="size-3" />
              {{ Math.abs(incomeDelta) }}%
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-error/10 text-error flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-trending-down" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('dashboard.expenses') }}</div>
            <div class="text-xl font-semibold text-error tabular-nums">CHF {{ chf(data.expenses) }}</div>
            <div
              v-if="expensesDelta !== null"
              class="mt-0.5 flex items-center gap-0.5 text-xs"
              :class="expensesDelta <= 0 ? 'text-success' : 'text-error'"
              :title="$t('dashboard.vsLastMonth')"
            >
              <UIcon :name="expensesDelta >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="size-3" />
              {{ Math.abs(expensesDelta) }}%
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span
            class="size-10 rounded-lg flex items-center justify-center shrink-0"
            :class="data.net >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"
          >
            <UIcon name="i-lucide-wallet" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('dashboard.net') }}</div>
            <div
              class="text-xl font-semibold tabular-nums"
              :class="data.net >= 0 ? 'text-success' : 'text-error'"
            >
              CHF {{ chf(data.net) }}
            </div>
            <div
              v-if="netDelta !== null"
              class="mt-0.5 flex items-center gap-0.5 text-xs"
              :class="netDelta >= 0 ? 'text-success' : 'text-error'"
              :title="$t('dashboard.vsLastMonth')"
            >
              <UIcon :name="netDelta >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="size-3" />
              {{ Math.abs(netDelta) }}%
            </div>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UIcon name="i-lucide-calendar-clock" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm text-muted">{{ $t('dashboard.expected') }}</div>
            <div class="text-xl font-semibold tabular-nums">CHF {{ chf(data.expected) }}</div>
            <div v-if="data.outstanding > 0" class="text-xs text-muted">
              {{ $t('dashboard.outstanding', { amount: chf(data.outstanding) }) }}
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 items-start">
      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ $t('dashboard.expensesByCategory') }}</h2>
        </template>
        <EmptyState
          v-if="!data.byCategory.length"
          :bordered="false"
          icon="i-lucide-pie-chart"
          :title="$t('dashboard.noExpensesTitle')"
          :description="$t('dashboard.noExpensesText')"
        />
        <ul v-else class="space-y-3">
          <li v-for="c in data.byCategory" :key="c.name">
            <div class="flex items-center gap-2 text-sm">
              <UIcon :name="c.icon" :style="{ color: c.color }" class="size-4 shrink-0" />
              <span class="flex-1 truncate">{{ c.name }}</span>
              <span class="text-muted tabular-nums">CHF {{ chf(c.total) }}</span>
            </div>
            <div class="h-2 rounded-full bg-elevated mt-1.5 overflow-hidden">
              <div
                class="h-full rounded-full"
                :style="{
                  width: `${(c.total / categoryTotal) * 100}%`,
                  backgroundColor: c.color
                }"
              />
            </div>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ $t('dashboard.trend') }}</h2>
            <div class="flex items-center gap-3 text-xs text-muted">
              <span class="flex items-center gap-1.5">
                <span class="size-2 rounded-full bg-success" />{{ $t('dashboard.income') }}
              </span>
              <span class="flex items-center gap-1.5">
                <span class="size-2 rounded-full bg-error" />{{ $t('dashboard.expenses') }}
              </span>
            </div>
          </div>
        </template>
        <div class="relative h-72">
          <div class="absolute inset-0 flex flex-col justify-between">
            <div v-for="n in 4" :key="n" class="border-t border-default" />
          </div>
          <div class="relative flex h-full items-end justify-between gap-3">
            <div
              v-for="t in data.trend"
              :key="t.month"
              class="flex h-full flex-1 items-end justify-center gap-1.5"
            >
              <div
                class="w-1/3 max-w-5 rounded-t bg-success transition-all"
                :style="{ height: `${Math.max(1.5, (t.income / trendMax) * 100)}%` }"
                :title="`${$t('dashboard.income')}: CHF ${chf(t.income)}`"
              />
              <div
                class="w-1/3 max-w-5 rounded-t bg-error transition-all"
                :style="{ height: `${Math.max(1.5, (t.expenses / trendMax) * 100)}%` }"
                :title="`${$t('dashboard.expenses')}: CHF ${chf(t.expenses)}`"
              />
            </div>
          </div>
        </div>
        <div class="mt-2 flex justify-between gap-3">
          <span
            v-for="t in data.trend"
            :key="t.month"
            class="flex-1 text-center text-xs text-muted"
          >
            {{ monthLabel(t.month) }}
          </span>
        </div>
      </UCard>
    </div>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">{{ $t('dashboard.recurring') }}</h2>
      </template>
      <EmptyState
        v-if="!data.recurring.length"
        :bordered="false"
        icon="i-lucide-banknote"
        :title="$t('dashboard.noIncomeTitle')"
        :description="$t('dashboard.noIncomeText')"
      />
      <ul v-else class="divide-y divide-default -my-2">
        <li v-for="r in data.recurring" :key="r.company" class="flex items-center gap-3 py-3">
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ r.company }}</div>
            <div class="text-xs text-muted">{{ $t('dashboard.pays', { date: formatDate(r.pay_date) }) }}</div>
          </div>
          <span class="text-sm whitespace-nowrap tabular-nums">CHF {{ chf(r.salary_rappen) }}</span>
          <UBadge :color="r.paid ? 'success' : 'neutral'" variant="subtle" size="sm">
            {{ r.paid ? $t('dashboard.received') : $t('dashboard.pending') }}
          </UBadge>
        </li>
      </ul>
    </UCard>
  </div>
</template>
