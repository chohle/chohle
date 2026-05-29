<script setup lang="ts">
interface InvoiceHit { id: number, number: string, title: string, customer_name: string }
interface CustomerHit { id: number, name: string, customer_number: string | null, city: string | null }
interface ArticleHit { id: number, name: string, unit: string, default_price_rappen: number }
interface ExpenseHit { id: number, title: string, vendor: string | null, date: string, amount_rappen: number }
interface SearchResult {
  invoices: InvoiceHit[]
  customers: CustomerHit[]
  articles: ArticleHit[]
  expenses: ExpenseHit[]
}

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const query = ref('')
const loading = ref(false)
const result = ref<SearchResult>({ invoices: [], customers: [], articles: [], expenses: [] })

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestId = 0
watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q.trim()) {
    result.value = { invoices: [], customers: [], articles: [], expenses: [] }
    loading.value = false
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    const id = ++requestId
    try {
      const r = await $fetch<SearchResult>('/api/search', { query: { q } })
      if (id === requestId) result.value = r
    } finally {
      if (id === requestId) loading.value = false
    }
  }, 150)
})

watch(open, (v) => {
  if (!v) {
    query.value = ''
    result.value = { invoices: [], customers: [], articles: [], expenses: [] }
  }
})

function chf(rappen: number) {
  return 'CHF ' + (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function go(to: string) {
  open.value = false
  navigateTo(to)
}

const groups = computed(() => [
  {
    id: 'invoices',
    label: t('nav.invoices'),
    ignoreFilter: true,
    items: result.value.invoices.map(i => ({
      label: i.number || t('common.untitled'),
      suffix: i.title ? `${i.title} - ${i.customer_name}` : i.customer_name,
      icon: 'i-lucide-file-text',
      onSelect: () => go(`/invoices/${i.id}`)
    }))
  },
  {
    id: 'customers',
    label: t('nav.customers'),
    ignoreFilter: true,
    items: result.value.customers.map(c => ({
      label: c.name,
      suffix: [c.customer_number, c.city].filter(Boolean).join(' - ') || undefined,
      icon: 'i-lucide-users',
      onSelect: () => go(`/customers/${c.id}`)
    }))
  },
  {
    id: 'articles',
    label: t('nav.articles'),
    ignoreFilter: true,
    items: result.value.articles.map(a => ({
      label: a.name,
      suffix: `${chf(a.default_price_rappen)} / ${a.unit}`,
      icon: 'i-lucide-package',
      onSelect: () => go('/articles')
    }))
  },
  {
    id: 'expenses',
    label: t('nav.expenses'),
    ignoreFilter: true,
    items: result.value.expenses.map(e => ({
      label: e.title,
      suffix: [e.vendor, chf(e.amount_rappen)].filter(Boolean).join(' - '),
      icon: 'i-lucide-receipt',
      onSelect: () => go('/expenses')
    }))
  }
].filter(g => g.items.length))
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-full sm:max-w-2xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="query"
        :groups="groups"
        :loading="loading"
        :placeholder="t('search.placeholder')"
        close
        @update:open="open = $event"
      >
        <template #empty>
          <div class="px-4 py-10 text-center text-sm text-muted">
            {{ query ? t('search.empty') : t('search.hint') }}
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
