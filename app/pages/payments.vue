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
const { data } = await useFetch<Payload>('/api/payments', { query: { year } })

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function dateFmt(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, { day: '2-digit', month: 'short', year: 'numeric' })
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
</script>

<template>
  <div>
    <PageHeader :title="$t('payments.title')" :description="$t('payments.subtitle')">
      <template #actions>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('common.prevYear')"
            @click="year--"
          />
          <span class="text-sm tabular-nums px-1">{{ data?.year ?? year }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="$t('common.nextYear')"
            @click="year++"
          />
        </div>
      </template>
    </PageHeader>

    <UCard class="mb-4">
      <div class="flex items-center gap-3">
        <span class="size-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-banknote" class="size-5" />
        </span>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wider text-muted">{{ $t('payments.total') }}</div>
          <div class="text-xl font-semibold tabular-nums">CHF {{ chf(data?.total ?? 0) }}</div>
        </div>
      </div>
    </UCard>

    <UCard>
      <EmptyState
        v-if="!data || !data.rows.length"
        icon="i-lucide-banknote"
        :title="$t('payments.emptyTitle')"
        :description="$t('payments.emptyText')"
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[600px] text-sm">
          <thead class="text-muted text-left">
            <tr class="border-b border-default">
              <th class="py-2 font-medium">{{ $t('payments.colDate') }}</th>
              <th class="py-2 font-medium">{{ $t('payments.colSource') }}</th>
              <th class="py-2 font-medium text-right">{{ $t('payments.colAmount') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in grouped" :key="g.ym">
              <tr class="bg-elevated/40">
                <td colspan="3" class="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted flex items-center justify-between">
                  <span>{{ monthLabel(g.ym) }}</span>
                  <span class="tabular-nums">CHF {{ chf(g.total) }}</span>
                </td>
              </tr>
              <tr
                v-for="r in g.rows"
                :key="`${r.kind}-${r.id}`"
                class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
              >
                <td class="py-2 whitespace-nowrap tabular-nums">{{ dateFmt(r.date) }}</td>
                <td class="py-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <UIcon
                      :name="r.kind === 'invoice' ? 'i-lucide-file-text' : 'i-lucide-briefcase'"
                      class="size-4 shrink-0"
                      :class="r.kind === 'invoice' ? 'text-primary' : 'text-success'"
                    />
                    <div class="min-w-0">
                      <component
                        :is="r.link ? 'NuxtLink' : 'span'"
                        :to="r.link"
                        class="font-medium truncate"
                        :class="r.link ? 'hover:underline' : ''"
                      >{{ r.label }}</component>
                      <div class="text-xs text-muted truncate">{{ r.sub_label }}</div>
                    </div>
                  </div>
                </td>
                <td class="py-2 text-right whitespace-nowrap tabular-nums">CHF {{ chf(r.amount_rappen) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
