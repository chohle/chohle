<script setup lang="ts">
interface Summary {
  month: string
  income: number
  expenses: number
  net: number
  byCategory: { name: string, color: string, icon: string, total: number }[]
  trend: { month: string, income: number, expenses: number }[]
}

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

function monthLabel(ym: string) {
  return new Date(`${ym}-01`).toLocaleDateString('de-CH', { month: 'short' })
}
</script>

<template>
  <div v-if="data" class="max-w-4xl">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-muted mt-1">Your month at a glance.</p>
      </div>
      <input
        v-model="month"
        type="month"
        class="h-8 rounded border border-default bg-default px-2"
      >
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
      <UCard>
        <div class="text-sm text-muted">Income</div>
        <div class="text-2xl font-semibold text-success mt-1">CHF {{ chf(data.income) }}</div>
      </UCard>
      <UCard>
        <div class="text-sm text-muted">Expenses</div>
        <div class="text-2xl font-semibold text-error mt-1">CHF {{ chf(data.expenses) }}</div>
      </UCard>
      <UCard>
        <div class="text-sm text-muted">Net</div>
        <div
          class="text-2xl font-semibold mt-1"
          :class="data.net >= 0 ? 'text-success' : 'text-error'"
        >
          CHF {{ chf(data.net) }}
        </div>
      </UCard>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <UCard>
        <template #header>
          <h2 class="font-semibold">Expenses by category</h2>
        </template>
        <p v-if="!data.byCategory.length" class="text-muted text-sm">
          No expenses this month.
        </p>
        <ul v-else class="space-y-3">
          <li v-for="c in data.byCategory" :key="c.name">
            <div class="flex items-center gap-2 text-sm">
              <UIcon :name="c.icon" :style="{ color: c.color }" class="size-4 shrink-0" />
              <span class="flex-1 truncate">{{ c.name }}</span>
              <span class="text-muted">CHF {{ chf(c.total) }}</span>
            </div>
            <div class="h-1.5 rounded bg-elevated mt-1 overflow-hidden">
              <div
                class="h-full rounded"
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
          <h2 class="font-semibold">6-month trend</h2>
        </template>
        <div class="flex items-end justify-between gap-2 h-40">
          <div
            v-for="t in data.trend"
            :key="t.month"
            class="flex-1 flex flex-col items-center gap-1 h-full justify-end"
          >
            <div class="flex items-end gap-0.5 h-full w-full justify-center">
              <div
                class="w-2.5 rounded-t bg-success"
                :style="{ height: `${(t.income / trendMax) * 100}%` }"
                :title="`Income: CHF ${chf(t.income)}`"
              />
              <div
                class="w-2.5 rounded-t bg-error"
                :style="{ height: `${(t.expenses / trendMax) * 100}%` }"
                :title="`Expenses: CHF ${chf(t.expenses)}`"
              />
            </div>
            <span class="text-xs text-muted">{{ monthLabel(t.month) }}</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
