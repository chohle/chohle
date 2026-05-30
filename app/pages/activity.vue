<script setup lang="ts">
type Kind = 'paid' | 'sent' | 'overdue' | 'expense' | 'salary'
type Period = 'week' | 'month' | 'lastMonth' | 'custom'

interface ActivityEvent {
  id: string
  kind: Kind
  at: string
  text: string
  amount_rappen: number
  link?: string
}

interface ActivityPayload {
  events: ActivityEvent[]
  counts: Record<Kind, number>
  week: { net_rappen: number; in_rappen: number; out_rappen: number }
}

const { t, locale } = useI18n()
const { data } = await useFetch<ActivityPayload>('/api/activity')

const KIND_ICON: Record<Kind, string> = {
  paid: 'i-lucide-check',
  sent: 'i-lucide-send',
  overdue: 'i-lucide-bell',
  expense: 'i-lucide-receipt',
  salary: 'i-lucide-coins'
}

const filters = reactive<Record<Kind, boolean>>({
  paid: true,
  sent: true,
  overdue: true,
  expense: true,
  salary: true
})

const period = ref<Period>('month')
const customMonth = ref(new Date().toISOString().slice(0, 7))
const PAGE_SIZE = 25
const shown = ref(PAGE_SIZE)

// Reset pagination when filters, period or custom month change so we
// don't strand the user in the middle of a now-shorter list.
watch([filters, period, customMonth], () => { shown.value = PAGE_SIZE }, { deep: true })

const todayDate = new Date()
const todayIso = todayDate.toISOString().slice(0, 10)
const sevenDaysAgoIso = (() => {
  const d = new Date(todayDate)
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
})()

function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Window per period — half-open [start, end).
const window_ = computed<{ start: string; end: string | null }>(() => {
  if (period.value === 'week') return { start: sevenDaysAgoIso, end: null }
  if (period.value === 'month') {
    return { start: isoFromYMD(todayDate.getFullYear(), todayDate.getMonth() + 1, 1), end: null }
  }
  if (period.value === 'lastMonth') {
    const last = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
    const thisMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
    return {
      start: isoFromYMD(last.getFullYear(), last.getMonth() + 1, 1),
      end: isoFromYMD(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1)
    }
  }
  // custom — exact month chosen via MonthSelect (YYYY-MM).
  const [y, m] = customMonth.value.split('-').map(Number) as [number, number]
  const next = new Date(y, m, 1)
  return {
    start: isoFromYMD(y, m, 1),
    end: isoFromYMD(next.getFullYear(), next.getMonth() + 1, 1)
  }
})

const filtered = computed(() => {
  const events = (data.value?.events ?? []).filter(e => filters[e.kind])
  const w = window_.value
  return events.filter(e => e.at >= w.start && (w.end === null || e.at < w.end))
})

const visible = computed(() => filtered.value.slice(0, shown.value))
const hasMore = computed(() => filtered.value.length > shown.value)

function loadMore() {
  shown.value = Math.min(shown.value + PAGE_SIZE, filtered.value.length)
}

const groups = computed(() => {
  const today: ActivityEvent[] = []
  const week: ActivityEvent[] = []
  const earlier: ActivityEvent[] = []
  for (const e of visible.value) {
    if (e.at === todayIso) today.push(e)
    else if (e.at >= sevenDaysAgoIso) week.push(e)
    else earlier.push(e)
  }
  return [
    { label: t('activity.today'), items: today },
    { label: t('activity.thisWeek'), items: week },
    { label: t('activity.earlier'), items: earlier }
  ].filter(g => g.items.length)
})

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function relTime(iso: string): string {
  const days = Math.floor((Date.parse(todayIso) - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return t('activity.todayShort')
  if (days === 1) return t('activity.yesterday')
  if (days < 7) return t('activity.daysAgo', { n: days })
  if (days < 30) return t('activity.weeksAgo', { n: Math.floor(days / 7) })
  return new Date(iso).toLocaleDateString(locale.value, { day: '2-digit', month: 'short' })
}

const KIND_LABEL: Record<Kind, string> = {
  paid: t('activity.kind.paid'),
  sent: t('activity.kind.sent'),
  overdue: t('activity.kind.overdue'),
  expense: t('activity.kind.expense'),
  salary: t('activity.kind.salary')
}

const orderedKinds: Kind[] = ['paid', 'sent', 'overdue', 'expense', 'salary']

const periodOptions = computed(() => [
  { value: 'week', label: t('activity.period.week') },
  { value: 'month', label: t('activity.period.month') },
  { value: 'lastMonth', label: t('activity.period.lastMonth') },
  { value: 'custom', label: t('activity.period.custom') }
])

const activeCount = computed(() => orderedKinds.filter(k => filters[k]).length)
const allActive = computed(() => activeCount.value === orderedKinds.length)
const filterTriggerLabel = computed(() =>
  allActive.value ? t('activity.allKinds') : t('activity.kindsActive', { n: activeCount.value })
)
const filterOpen = ref(false)

function go(link: string | undefined) {
  if (link) navigateTo(link)
}
</script>

<template>
  <div v-if="data" class="page-activity">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.activity')}`"
      :title="$t('activity.title')"
      :subtitle="$t('activity.subtitle')"
    >
      <template #actions>
        <div class="page-activity__head-actions">
          <UiSegmentedControl v-model="period" :options="periodOptions" :aria-label="$t('activity.periodLabel')" />
          <MonthSelect v-if="period === 'custom'" v-model="customMonth" />
        </div>
      </template>
    </UiPageHead>

    <div class="page-activity__mobile-bar">
      <UPopover v-model:open="filterOpen" :ui="{ content: 'page-activity__pop' }">
        <button class="page-activity__mobile-trigger" type="button">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
          <span class="page-activity__mobile-trigger-label">{{ filterTriggerLabel }}</span>
          <UIcon name="i-lucide-chevron-down" class="size-3.5 page-activity__mobile-trigger-caret" />
        </button>
        <template #content>
          <div class="eyebrow page-activity__side-title">{{ $t('activity.filterBy') }}</div>
          <ul class="page-activity__filter-list">
            <li v-for="k in orderedKinds" :key="k" class="page-activity__filter">
              <label class="page-activity__filter-row">
                <span class="page-activity__check" :class="{ on: filters[k] }">
                  <UIcon v-if="filters[k]" name="i-lucide-check" class="size-3" />
                </span>
                <input v-model="filters[k]" type="checkbox" class="page-activity__sr">
                <span class="page-activity__filter-label">{{ KIND_LABEL[k] }}</span>
                <span class="mono page-activity__filter-count">{{ data.counts[k] }}</span>
              </label>
            </li>
          </ul>
        </template>
      </UPopover>

      <div class="page-activity__mobile-week mono">
        <span class="eyebrow">{{ $t('activity.thisWeek') }}</span>
        <span class="tabular page-activity__mobile-net">
          {{ data.week.net_rappen < 0 ? '−' : '' }}CHF {{ chf(Math.abs(data.week.net_rappen)) }}
        </span>
      </div>
    </div>

    <div class="page-activity__grid">
      <UiCard>
        <EmptyState
          v-if="!filtered.length"
          :bordered="false"
          icon="i-lucide-inbox"
          :title="$t('activity.emptyTitle')"
          :description="$t('activity.emptyText')"
        />
        <template v-else>
          <template v-for="(g, gi) in groups" :key="g.label">
            <div v-if="gi > 0" class="page-activity__divider" />
            <div class="page-activity__group-label eyebrow">{{ g.label }}</div>
            <button
              v-for="ev in g.items"
              :key="ev.id"
              type="button"
              class="activity-row"
              :class="{ 'is-link': !!ev.link, [`is-${ev.kind}`]: true }"
              :tabindex="ev.link ? 0 : -1"
              :aria-label="ev.text"
              @click="go(ev.link)"
              @keydown.enter.prevent="go(ev.link)"
              @keydown.space.prevent="go(ev.link)"
            >
              <span class="activity-row__icon">
                <UIcon :name="KIND_ICON[ev.kind]" />
              </span>
              <span class="activity-row__body">
                <UiRichText :text="ev.text" />
              </span>
              <span class="activity-row__time mono">{{ relTime(ev.at) }}</span>
            </button>
          </template>

          <div v-if="hasMore" class="page-activity__more">
            <button class="ed-btn" type="button" @click="loadMore">
              {{ $t('activity.loadMore', { n: Math.min(PAGE_SIZE, filtered.length - shown) }) }}
            </button>
            <span class="page-activity__more-meta mono">
              {{ $t('activity.showing', { shown: visible.length, total: filtered.length }) }}
            </span>
          </div>
        </template>
      </UiCard>

      <aside class="page-activity__side">
        <UiCard>
          <div class="eyebrow page-activity__side-title">{{ $t('activity.filterBy') }}</div>
          <ul class="page-activity__filter-list">
            <li v-for="k in orderedKinds" :key="k" class="page-activity__filter">
              <label class="page-activity__filter-row">
                <span class="page-activity__check" :class="{ on: filters[k] }">
                  <UIcon v-if="filters[k]" name="i-lucide-check" class="size-3" />
                </span>
                <input v-model="filters[k]" type="checkbox" class="page-activity__sr">
                <span class="page-activity__filter-label">{{ KIND_LABEL[k] }}</span>
                <span class="mono page-activity__filter-count">{{ data.counts[k] }}</span>
              </label>
            </li>
          </ul>
        </UiCard>

        <UiCard>
          <div class="eyebrow page-activity__side-title">{{ $t('activity.thisWeek') }}</div>
          <div class="page-activity__net tabular">
            <span class="page-activity__cur">CHF</span>
            {{ chf(Math.abs(data.week.net_rappen)) }}
            <span v-if="data.week.net_rappen < 0" class="page-activity__sign">−</span>
          </div>
          <div class="page-activity__net-meta mono">
            {{ $t('activity.netChange') }}
          </div>
          <div class="page-activity__week-grid mono">
            <div>
              <div class="eyebrow">{{ $t('activity.in') }}</div>
              <div class="tabular">CHF {{ chf(data.week.in_rappen) }}</div>
            </div>
            <div>
              <div class="eyebrow">{{ $t('activity.out') }}</div>
              <div class="tabular">CHF {{ chf(data.week.out_rappen) }}</div>
            </div>
          </div>
        </UiCard>
      </aside>
    </div>
  </div>
</template>
