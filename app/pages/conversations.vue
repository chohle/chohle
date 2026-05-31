<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

interface ThreadRow {
  project_id: number
  project_name: string
  project_direction: 'sales' | 'procurement'
  project_stage: string
  customer_id: number | null
  customer_name: string | null
  total: number
  inbound: number
  outbound: number
  last_at: string
  last_subject: string
  last_direction: 'inbound' | 'outbound'
}

interface ProjectEmail {
  id: number
  project_id: number
  direction: 'outbound' | 'inbound'
  from_address: string | null
  to_address: string | null
  subject: string
  body_html: string
  body_text: string
  sent_at: string
  created_at: string
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { data: threads } = await useFetch<ThreadRow[]>('/api/conversations', { default: () => [] })

// `?project=` in the URL drives which thread the right pane shows. Defaults
// to the first thread on load so the user always sees something.
const selectedId = computed<number | null>(() => {
  const q = Number(route.query.project)
  if (Number.isFinite(q) && q > 0) return q
  return threads.value[0]?.project_id ?? null
})

function pick(id: number) {
  router.replace({ query: { ...route.query, project: String(id) } })
}

// Right pane filter
const filter = ref<'all' | 'inbound' | 'outbound'>('all')
const filterOptions = computed(() => [
  { value: 'all',      label: t('conversations.filterAll') },
  { value: 'inbound',  label: t('conversations.filterReceived') },
  { value: 'outbound', label: t('conversations.filterSent') }
])

const messagesUrl = computed(() => selectedId.value
  ? `/api/projects/${selectedId.value}/emails`
  : null)
const { data: thread, refresh: refreshThread } = await useFetch<{ rows: ProjectEmail[] }>(
  messagesUrl,
  { default: () => ({ rows: [] }), watch: [messagesUrl] }
)

const filteredRows = computed(() => {
  const rows = thread.value?.rows ?? []
  if (filter.value === 'all') return rows
  return rows.filter(r => r.direction === filter.value)
})

const selectedThread = computed(() => threads.value.find(t => t.project_id === selectedId.value) ?? null)

const DIR_TO_SLUG: Record<'sales' | 'procurement', string> = { sales: 'vertrieb', procurement: 'einkauf' }

function fmtTimestamp(s: string) {
  const ymd = s.slice(0, 10)
  const hm = s.slice(11, 16)
  return hm ? `${dateCh(ymd)} · ${hm}` : dateCh(ymd)
}

function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

// `tabindex="0"` rows are keyboard navigable. Scroll the selected thread row
// into view when the route changes (e.g. via ?project= from the URL).
const listRef = ref<HTMLElement>()
watch(selectedId, async () => {
  await nextTick()
  listRef.value?.querySelector<HTMLElement>('.conv-list__row.is-active')?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="page-conversations">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('conversations.title')}`"
      :title="$t('conversations.title')"
      :subtitle="$t('conversations.subtitle')"
    />

    <EmptyState
      v-if="!threads.length"
      icon="i-lucide-mail"
      :title="$t('conversations.emptyTitle')"
      :description="$t('conversations.emptyText')"
    />

    <div v-else class="page-conversations__shell">
      <aside ref="listRef" class="conv-list">
        <button
          v-for="t in threads"
          :key="t.project_id"
          type="button"
          class="conv-list__row"
          :class="{ 'is-active': t.project_id === selectedId }"
          @click="pick(t.project_id)"
        >
          <div class="conv-list__row-head">
            <span class="conv-list__name">{{ t.customer_name || t.project_name }}</span>
            <span class="conv-list__time mono">{{ dateCh(t.last_at.slice(0, 10)) }}</span>
          </div>
          <div class="conv-list__row-sub">
            <span class="conv-list__project mono">{{ t.project_name }}</span>
            <span class="conv-list__count mono">{{ t.total }}</span>
          </div>
          <div class="conv-list__row-snippet">
            <span class="conv-list__dir mono">{{ t.last_direction === 'inbound' ? '←' : '→' }}</span>
            {{ t.last_subject || $t('conversations.noSubject') }}
          </div>
        </button>
      </aside>

      <section class="conv-thread">
        <header v-if="selectedThread" class="conv-thread__head">
          <div class="conv-thread__title-row">
            <h2 class="conv-thread__title">{{ selectedThread.customer_name || selectedThread.project_name }}</h2>
            <NuxtLink :to="`/${DIR_TO_SLUG[selectedThread.project_direction]}/${selectedThread.project_id}`" class="conv-thread__project-link mono">
              <UIcon name="i-lucide-kanban" class="size-3.5" />
              {{ selectedThread.project_name }}
            </NuxtLink>
          </div>
          <div class="conv-thread__meta mono">
            <span>{{ selectedThread.total }} {{ $t('conversations.messages') }}</span>
            <span>· {{ selectedThread.inbound }} {{ $t('conversations.received') }}</span>
            <span>· {{ selectedThread.outbound }} {{ $t('conversations.sent') }}</span>
          </div>
          <div class="conv-thread__filter">
            <UiSegmentedControl v-model="filter" :options="filterOptions" />
          </div>
        </header>

        <ul v-if="filteredRows.length" class="conv-thread__list">
          <li
            v-for="ev in filteredRows"
            :key="ev.id"
            class="email-msg"
            :class="`is-${ev.direction}`"
          >
            <header class="email-msg__head">
              <span class="mono email-msg__dir">{{ ev.direction === 'outbound' ? $t('pipeline.detail.sent') : $t('pipeline.detail.received') }}</span>
              <span class="mono email-msg__time">{{ fmtTimestamp(ev.sent_at) }}</span>
            </header>
            <h4 class="email-msg__subject">{{ ev.subject || $t('conversations.noSubject') }}</h4>
            <div v-if="ev.body_html" class="email-msg__body" v-html="sanitizeHtml(ev.body_html)" />
            <pre v-else-if="ev.body_text" class="email-msg__body email-msg__body--text">{{ ev.body_text }}</pre>
            <footer v-if="ev.from_address || ev.to_address" class="email-msg__foot mono">
              <span v-if="ev.direction === 'outbound' && ev.to_address">→ {{ ev.to_address }}</span>
              <span v-else-if="ev.direction === 'inbound' && ev.from_address">← {{ ev.from_address }}</span>
            </footer>
          </li>
        </ul>

        <div v-else-if="selectedThread" class="conv-thread__empty">
          {{ $t('conversations.noneInFilter') }}
        </div>
      </section>
    </div>
  </div>
</template>
