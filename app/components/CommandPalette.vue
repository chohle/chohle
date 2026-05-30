<script setup lang="ts">
interface InvoiceHit { id: number, number: string, title: string, customer_name: string }
interface CustomerHit { id: number, name: string, customer_number: string | null, city: string | null }
interface ArticleHit { id: number, name: string, unit: string, default_price_rappen: number }
interface ExpenseHit { id: number, title: string, vendor: string | null, date: string, amount_rappen: number }
interface DealHit { id: number, name: string, direction: 'sales' | 'procurement', stage: string, customer_name: string | null }
interface SearchResult {
  invoices: InvoiceHit[]
  customers: CustomerHit[]
  articles: ArticleHit[]
  expenses: ExpenseHit[]
  deals: DealHit[]
}

interface Group {
  id: string
  label: string
  items: { id: string, label: string, suffix?: string, icon: string, to: string }[]
}

type Scope = 'all' | 'invoices' | 'customers' | 'articles' | 'expenses' | 'deals'

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const query = ref('')
const scope = ref<Scope>('all')
const loading = ref(false)
const empty: SearchResult = { invoices: [], customers: [], articles: [], expenses: [], deals: [] }
const result = ref<SearchResult>({ ...empty })
const inputRef = ref<HTMLInputElement>()

const scopes = computed<{ id: Scope, label: string }[]>(() => [
  { id: 'all',       label: t('search.scope.all') },
  { id: 'invoices',  label: t('nav.invoices') },
  { id: 'customers', label: t('nav.customers') },
  { id: 'articles',  label: t('nav.articles') },
  { id: 'expenses',  label: t('nav.expenses') },
  { id: 'deals',     label: t('search.scope.deals') }
])

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0
function fetchNow() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  // Always bump the id so any in-flight response from a prior keystroke
  // is discarded, even when we early-return on empty / on close.
  const id = ++requestId
  if (!query.value.trim()) {
    result.value = { ...empty }
    loading.value = false
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      const r = await $fetch<SearchResult>('/api/search', { query: { q: query.value, scope: scope.value } })
      if (id === requestId) result.value = r
    } catch (err) {
      // Swallow so the rejection doesn't bubble as unhandled. Clear results
      // on the live request only — a stale rejection mustn't wipe newer data.
      if (id === requestId) result.value = { ...empty }
      console.error('[search] fetch failed', err)
    } finally {
      if (id === requestId) loading.value = false
    }
  }, 150)
}

watch(query, fetchNow)
watch(scope, fetchNow)

watch(open, async (v) => {
  if (v) {
    await nextTick()
    inputRef.value?.focus()
  } else {
    // Invalidate any pending fetch so it can't write to result after close.
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    ++requestId
    query.value = ''
    scope.value = 'all'
    result.value = { ...empty }
    loading.value = false
  }
})

function chf(rappen: number) {
  return 'CHF ' + (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function go(to: string) {
  open.value = false
  navigateTo(to)
}

const DIR_TO_SLUG: Record<'sales' | 'procurement', string> = { sales: 'vertrieb', procurement: 'einkauf' }

const groups = computed<Group[]>(() => [
  {
    id: 'invoices',
    label: t('nav.invoices'),
    items: result.value.invoices.map(i => ({
      id: `inv-${i.id}`,
      label: i.number || t('common.untitled'),
      suffix: i.title ? `${i.title} - ${i.customer_name}` : i.customer_name,
      icon: 'i-lucide-file-text',
      to: `/invoices/${i.id}`
    }))
  },
  {
    id: 'customers',
    label: t('nav.customers'),
    items: result.value.customers.map(c => ({
      id: `cus-${c.id}`,
      label: c.name,
      suffix: [c.customer_number, c.city].filter(Boolean).join(' - ') || undefined,
      icon: 'i-lucide-users',
      to: `/customers/${c.id}`
    }))
  },
  {
    id: 'articles',
    label: t('nav.articles'),
    items: result.value.articles.map(a => ({
      id: `art-${a.id}`,
      label: a.name,
      suffix: `${chf(a.default_price_rappen)} / ${a.unit}`,
      icon: 'i-lucide-package',
      to: '/articles'
    }))
  },
  {
    id: 'expenses',
    label: t('nav.expenses'),
    items: result.value.expenses.map(e => ({
      id: `exp-${e.id}`,
      label: e.title,
      suffix: [e.vendor, chf(e.amount_rappen)].filter(Boolean).join(' - '),
      icon: 'i-lucide-receipt',
      to: '/expenses'
    }))
  },
  {
    id: 'deals',
    label: t('search.scope.deals'),
    items: result.value.deals.map(d => ({
      id: `deal-${d.id}`,
      label: d.customer_name || d.name,
      suffix: [
        d.customer_name && d.name !== d.customer_name ? d.name : null,
        d.direction === 'procurement' ? t('pipeline.direction.procurement') : t('pipeline.direction.sales')
      ].filter(Boolean).join(' - '),
      icon: 'i-lucide-kanban',
      to: `/${DIR_TO_SLUG[d.direction]}/${d.id}`
    }))
  }
].filter(g => g.items.length))

// Flat list across all groups so arrow keys can step through every visible
// result. Reset to the first row whenever the results change.
const flatItems = computed(() => groups.value.flatMap(g => g.items))
const activeIndex = ref(0)
watch(flatItems, () => { activeIndex.value = 0 })

function moveActive(delta: number) {
  const n = flatItems.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    const el = document.querySelector<HTMLElement>('.command-palette__item.is-active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1) }
  else if (e.key === 'Enter') {
    const item = flatItems.value[activeIndex.value]
    if (item) { e.preventDefault(); go(item.to) }
  }
  // Escape is handled by UModal (closes the dialog), no extra wiring needed.
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-full sm:max-w-3xl rounded-none' }">
    <template #content>
      <div class="command-palette">
        <button
          type="button"
          class="command-palette__close"
          :aria-label="t('common.close')"
          @click="open = false"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>

        <div class="command-palette__body">
          <label class="command-palette__input">
            <UIcon name="i-lucide-search" class="command-palette__input-icon" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              :placeholder="t('search.placeholder')"
              autocomplete="off"
              spellcheck="false"
              role="combobox"
              :aria-expanded="!!flatItems.length"
              aria-controls="command-palette-listbox"
              :aria-activedescendant="flatItems[activeIndex] ? `cp-item-${flatItems[activeIndex]?.id}` : undefined"
              @keydown="onInputKeydown"
            >
          </label>

          <div class="command-palette__scopes" role="tablist" :aria-label="t('search.scopeLabel')">
            <button
              v-for="s in scopes"
              :key="s.id"
              type="button"
              class="command-palette__scope"
              :class="{ 'is-active': scope === s.id }"
              role="tab"
              :aria-selected="scope === s.id"
              @click="scope = s.id"
            >{{ s.label }}</button>
          </div>

          <div class="command-palette__results">
            <div v-if="loading" class="command-palette__hint">
              <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            </div>
            <div v-else-if="query.trim() && !groups.length" class="command-palette__hint">
              {{ t('search.empty') }}
            </div>
            <template v-else>
              <div id="command-palette-listbox" role="listbox">
                <section
                  v-for="g in groups"
                  :key="g.id"
                  class="command-palette__group"
                >
                  <h4 class="command-palette__group-label eyebrow">— {{ g.label }}</h4>
                  <ul class="command-palette__list">
                    <li
                      v-for="item in g.items"
                      :key="item.id"
                    >
                      <button
                        :id="`cp-item-${item.id}`"
                        type="button"
                        class="command-palette__item"
                        :class="{ 'is-active': flatItems[activeIndex]?.id === item.id }"
                        role="option"
                        :aria-selected="flatItems[activeIndex]?.id === item.id"
                        @click="go(item.to)"
                        @mouseenter="activeIndex = flatItems.findIndex(i => i.id === item.id)"
                      >
                        <UIcon :name="item.icon" class="size-3.5 command-palette__item-icon" />
                        <span class="command-palette__item-label">{{ item.label }}</span>
                        <span v-if="item.suffix" class="command-palette__item-suffix mono">{{ item.suffix }}</span>
                      </button>
                    </li>
                  </ul>
                </section>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
