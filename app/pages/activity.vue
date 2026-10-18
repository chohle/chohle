<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import type { DateRange } from 'reka-ui'

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
  // Money in (paid invoices + salary) and out (expenses) per ISO day across
  // the whole response window, so the stat card can follow any period
  // client-side without a refetch and without being capped like `events`.
  daily: Record<string, { in_rappen: number; out_rappen: number }>
}

const { t, locale } = useI18n()
const { data, error, refresh } = await useFetch<ActivityPayload>('/api/activity')

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
const PAGE_SIZE = 25
const shown = ref(PAGE_SIZE)

function isoFromYMD(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Local calendar day, not toISOString(): that is UTC, which in Zurich is still
// "yesterday" until 01:00/02:00 and would mislabel today's events and ranges.
const todayDate = new Date()
const todayIso = isoFromYMD(todayDate.getFullYear(), todayDate.getMonth() + 1, todayDate.getDate())
const sevenDaysAgoIso = (() => {
  const d = new Date(todayDate)
  d.setDate(d.getDate() - 7)
  return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate())
})()

// Shift an ISO day by n days, in local time so DST never skews the result.
function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)
}

// Custom range, inclusive on both ends. Opens on the last 14 days so the
// first click already shows something useful; the quick spans and the
// calendar in the popover replace it.
const QUICK_SPANS = [3, 7, 14, 30, 90]
const customRange = ref<{ from: string; to: string }>({
  from: shiftIso(todayIso, -13),
  to: todayIso
})
const rangeOpen = ref(false)

// Reset pagination when filters, period or custom range change so we
// don't strand the user in the middle of a now-shorter list.
watch(
  [filters, period, customRange],
  () => {
    shown.value = PAGE_SIZE
  },
  { deep: true }
)

// Window per period, half-open [start, end).
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
  // custom: inclusive from/to, so bump the end by a day for the half-open test.
  return { start: customRange.value.from, end: shiftIso(customRange.value.to, 1) }
})

const filtered = computed(() => {
  const events = (data.value?.events ?? []).filter((e) => filters[e.kind])
  const w = window_.value
  return events.filter((e) => e.at >= w.start && (w.end === null || e.at < w.end))
})

const visible = computed(() => filtered.value.slice(0, shown.value))
const hasMore = computed(() => filtered.value.length > shown.value)

function loadMore() {
  shown.value = Math.min(shown.value + PAGE_SIZE, filtered.value.length)
}

// Net change for the selected window. Summed from the per-day aggregate
// rather than the (capped, kind-filtered) event list so the number is exact.
const periodStats = computed(() => {
  const w = window_.value
  let inR = 0
  let outR = 0
  for (const [day, v] of Object.entries(data.value?.daily ?? {})) {
    if (day < w.start || (w.end !== null && day >= w.end)) continue
    inR += v.in_rappen
    outR += v.out_rappen
  }
  return { net_rappen: inR - outR, in_rappen: inR, out_rappen: outR }
})

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
  ].filter((g) => g.items.length)
})

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

// The three presets live in the segmented control; the custom tab is a
// popover trigger rendered through the control's trailing slot.
const presetOptions = computed(() => [
  { value: 'week', label: t('activity.period.week') },
  { value: 'month', label: t('activity.period.month') },
  { value: 'lastMonth', label: t('activity.period.lastMonth') }
])

// "3 Oct – 19 Oct"; the year only appears when the range leaves the current one.
function shortDate(iso: string, withYear: boolean) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale.value, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {})
  })
}
const rangeLabel = computed(() => {
  const { from, to } = customRange.value
  const year = todayIso.slice(0, 4)
  const withYear = from.slice(0, 4) !== year || to.slice(0, 4) !== year
  if (from === to) return shortDate(from, withYear)
  return `${shortDate(from, withYear)} – ${shortDate(to, withYear)}`
})
const customTabLabel = computed(() =>
  period.value === 'custom' ? rangeLabel.value : t('activity.period.custom')
)
// Title of the stat card: follows the active period instead of a fixed week.
const periodTitle = computed(() =>
  period.value === 'custom' ? rangeLabel.value : t(`activity.period.${period.value}`)
)

function selectCustom() {
  period.value = 'custom'
}

// Quick span: the last n days ending today, inclusive.
function pickSpan(n: number) {
  customRange.value = { from: shiftIso(todayIso, -(n - 1)), to: todayIso }
  period.value = 'custom'
  rangeOpen.value = false
}
const activeSpan = computed(() => {
  if (period.value !== 'custom' || customRange.value.to !== todayIso) return null
  const n = daysBetween(customRange.value.from, customRange.value.to) + 1
  return QUICK_SPANS.includes(n) ? n : null
})

const calendarLocale = computed(() => `${locale.value}-CH`)
const calendarRange = computed<DateRange>(() => ({
  start: parseDate(customRange.value.from),
  end: parseDate(customRange.value.to)
}))
function onCalendar(v: DateValue | DateRange | DateValue[] | null | undefined) {
  // UCalendar runs in range mode here, so a DateRange arrives at runtime;
  // narrow defensively to satisfy the broad emit type. While the user is
  // still picking, `end` is empty: keep the popover open until both are set.
  if (!v || Array.isArray(v) || !('start' in v)) return
  const { start, end } = v
  if (!start || !end) return
  let from = start.toString()
  let to = end.toString()
  if (from > to) [from, to] = [to, from]
  customRange.value = { from, to }
  period.value = 'custom'
  rangeOpen.value = false
}

const activeCount = computed(() => orderedKinds.filter((k) => filters[k]).length)
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
  <FetchError v-if="error" @retry="refresh()" />
  <div v-else-if="data" class="page-activity">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.activity')}`"
      :title="$t('activity.title')"
      :subtitle="$t('activity.subtitle')"
    >
      <template #actions>
        <UiSegmentedControl
          v-model="period"
          :options="presetOptions"
          :aria-label="$t('activity.periodLabel')"
        >
          <template #after>
            <UPopover
              v-model:open="rangeOpen"
              :content="{ align: 'end', sideOffset: 8 }"
              :ui="{ content: 'date-picker__pop' }"
            >
              <button
                type="button"
                class="seg-ctrl__opt mono activity-range__tab"
                :class="{ 'is-active': period === 'custom' }"
                role="radio"
                :aria-checked="period === 'custom'"
                :aria-label="$t('activity.customRange')"
                @click="selectCustom"
              >
                <UIcon name="i-lucide-calendar-range" class="activity-range__icon" />
                <span>{{ customTabLabel }}</span>
              </button>
              <template #content>
                <div class="activity-range">
                  <div class="eyebrow activity-range__title">{{ $t('activity.quickRanges') }}</div>
                  <div class="activity-range__spans">
                    <button
                      v-for="n in QUICK_SPANS"
                      :key="n"
                      type="button"
                      class="activity-range__span mono"
                      :class="{ 'is-active': activeSpan === n }"
                      @click="pickSpan(n)"
                    >
                      {{ $t('activity.lastDays', { n }) }}
                    </button>
                  </div>
                  <div class="eyebrow activity-range__title">{{ $t('activity.pickRange') }}</div>
                  <UCalendar
                    range
                    :model-value="calendarRange"
                    :first-day-of-week="1"
                    :locale="calendarLocale"
                    @update:model-value="onCalendar"
                  />
                </div>
              </template>
            </UPopover>
          </template>
        </UiSegmentedControl>
      </template>
    </UiPageHead>

    <div class="page-activity__mobile-bar">
      <UPopover v-model:open="filterOpen" :ui="{ content: 'page-activity__pop' }">
        <button class="page-activity__mobile-trigger" type="button">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
          <span class="page-activity__mobile-trigger-label">{{ filterTriggerLabel }}</span>
          <UIcon
            name="i-lucide-chevron-down"
            class="page-activity__mobile-trigger-caret size-3.5"
          />
        </button>
        <template #content>
          <div class="eyebrow page-activity__side-title">{{ $t('activity.filterBy') }}</div>
          <ul class="page-activity__filter-list">
            <li v-for="k in orderedKinds" :key="k" class="page-activity__filter">
              <label class="page-activity__filter-row">
                <span class="page-activity__check" :class="{ on: filters[k] }">
                  <UIcon v-if="filters[k]" name="i-lucide-check" class="size-3" />
                </span>
                <input v-model="filters[k]" type="checkbox" class="page-activity__sr" />
                <span class="page-activity__filter-label">{{ KIND_LABEL[k] }}</span>
                <span class="mono page-activity__filter-count">{{ data.counts[k] }}</span>
              </label>
            </li>
          </ul>
        </template>
      </UPopover>

      <div class="page-activity__mobile-week mono">
        <span class="eyebrow">{{ periodTitle }}</span>
        <span class="tabular page-activity__mobile-net">
          {{ periodStats.net_rappen < 0 ? '−' : '' }}CHF {{ chf(Math.abs(periodStats.net_rappen)) }}
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
                <input v-model="filters[k]" type="checkbox" class="page-activity__sr" />
                <span class="page-activity__filter-label">{{ KIND_LABEL[k] }}</span>
                <span class="mono page-activity__filter-count">{{ data.counts[k] }}</span>
              </label>
            </li>
          </ul>
        </UiCard>

        <UiCard>
          <div class="eyebrow page-activity__side-title">{{ periodTitle }}</div>
          <div class="page-activity__net tabular">
            <span class="page-activity__cur">CHF</span>
            {{ chf(Math.abs(periodStats.net_rappen)) }}
            <span v-if="periodStats.net_rappen < 0" class="page-activity__sign">−</span>
          </div>
          <div class="page-activity__net-meta mono">
            {{ $t('activity.netChange') }}
          </div>
          <div class="page-activity__week-grid mono">
            <div>
              <div class="eyebrow">{{ $t('activity.in') }}</div>
              <div class="tabular">CHF {{ chf(periodStats.in_rappen) }}</div>
            </div>
            <div>
              <div class="eyebrow">{{ $t('activity.out') }}</div>
              <div class="tabular">CHF {{ chf(periodStats.out_rappen) }}</div>
            </div>
          </div>
        </UiCard>
      </aside>
    </div>
  </div>
</template>
