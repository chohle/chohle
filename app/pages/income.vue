<script setup lang="ts">
const cantons = [
  'ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL',
  'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'VD', 'VS', 'NE', 'GE', 'JU'
]

interface IncomeSource {
  id: number
  company: string
  job_title: string | null
  salary_rappen: number
  currency: string
  payout_day: number
  canton: string
  payout_rule: 'earlier' | 'later' | 'none'
  pay_date: string
  reason: string | null
  paid: boolean
}

const { t, locale } = useI18n()
const month = ref(new Date().toISOString().slice(0, 7))
const { data, refresh } = await useFetch<{ month: string, sources: IncomeSource[] }>(
  '/api/income/overview',
  { query: { month }, default: () => ({ month: '', sources: [] }) }
)

const ruleItems = computed(() => [
  { label: t('income.ruleEarlier'), value: 'earlier' },
  { label: t('income.ruleLater'), value: 'later' },
  { label: t('income.ruleNone'), value: 'none' }
])
const ruleLabel = (r: string) => ruleItems.value.find((i) => i.value === r)?.label ?? r

function blank() {
  return {
    id: null as number | null,
    company: '',
    jobTitle: '',
    salary: undefined as number | undefined,
    currency: 'CHF',
    payoutDay: 25,
    canton: 'LU',
    payoutRule: 'earlier' as IncomeSource['payout_rule']
  }
}
const form = reactive(blank())
const open = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blank())
  open.value = true
}

function openEdit(s: IncomeSource) {
  Object.assign(form, {
    id: s.id,
    company: s.company,
    jobTitle: s.job_title ?? '',
    salary: s.salary_rappen / 100,
    currency: s.currency,
    payoutDay: s.payout_day,
    canton: s.canton,
    payoutRule: s.payout_rule
  })
  open.value = true
}

async function save() {
  if (!form.company.trim() || !form.salary) return
  saving.value = true
  try {
    const body = {
      company: form.company,
      jobTitle: form.jobTitle,
      salary: form.salary,
      currency: form.currency,
      payoutDay: form.payoutDay,
      canton: form.canton,
      payoutRule: form.payoutRule
    }
    if (form.id) {
      await $fetch(`/api/income/sources/${form.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/income/sources', { method: 'POST', body })
    }
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await $fetch(`/api/income/sources/${id}`, { method: 'DELETE' })
  await refresh()
}

async function togglePaid(id: number) {
  await $fetch(`/api/income/sources/${id}/toggle-paid`, {
    method: 'POST',
    body: { month: month.value }
  })
  await refresh()
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale.value, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}
</script>

<template>
  <div>
    <PageHeader :title="$t('nav.income')" :description="$t('income.subtitle')">
      <template #actions>
        <MonthSelect v-model="month" />
      </template>
    </PageHeader>

    <UCard>
      <div class="flex justify-end mb-4">
        <UButton icon="i-lucide-plus" @click="openCreate">{{ $t('income.add') }}</UButton>
      </div>

      <EmptyState
        v-if="!data.sources.length"
        icon="i-lucide-briefcase"
        :title="$t('income.emptyTitle')"
        :description="$t('income.emptyText')"
      />
      <div v-else class="grid sm:grid-cols-2 gap-4">
        <div
          v-for="s in data.sources"
          :key="s.id"
          class="rounded-lg border border-default p-4"
        >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold">{{ s.company }}</div>
            <div v-if="s.job_title" class="text-sm text-muted">{{ s.job_title }}</div>
          </div>
          <div class="flex gap-1">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openEdit(s)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              @click="remove(s.id)"
            />
          </div>
        </div>
        <div class="text-xl font-semibold mt-2">{{ s.currency }} {{ chf(s.salary_rappen) }}</div>
        <div class="text-sm text-muted mt-1">
          {{ $t('income.paysOn', { day: s.payout_day }) }} · {{ s.canton }} · {{ ruleLabel(s.payout_rule) }}
        </div>
        <div class="mt-3 pt-3 border-t border-default flex items-start justify-between gap-2">
          <div>
            <div class="text-xs text-muted">{{ $t('income.paysThisMonth') }}</div>
            <div class="font-medium">{{ formatDate(s.pay_date) }}</div>
            <UBadge v-if="s.reason" color="warning" variant="subtle" size="sm" class="mt-1">
              {{ $t('income.moved') }} · {{ s.reason }}
            </UBadge>
            <div v-else class="text-xs text-muted mt-0.5">{{ $t('income.onSchedule') }}</div>
          </div>
          <div class="text-right">
            <UBadge :color="s.paid ? 'success' : 'neutral'" variant="subtle">
              {{ s.paid ? $t('common.received') : $t('common.pending') }}
            </UBadge>
            <div>
              <UButton size="xs" variant="link" class="px-0" @click="togglePaid(s.id)">
                {{ s.paid ? $t('income.markUnpaid') : $t('income.markPaid') }}
              </UButton>
            </div>
          </div>
        </div>
        </div>
      </div>
    </UCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('income.edit') : $t('income.add')"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body>
        <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="save">
          <UFormField :label="$t('income.company')" class="sm:col-span-2">
            <UInput v-model="form.company" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.jobTitle')" class="sm:col-span-2">
            <UInput v-model="form.jobTitle" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.salary')">
            <UInput v-model.number="form.salary" type="number" min="0" step="0.05" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.payoutDay')">
            <UInput v-model.number="form.payoutDay" type="number" min="1" max="31" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.canton')">
            <USelect v-model="form.canton" :items="cantons" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.adjustment')">
            <USelect v-model="form.payoutRule" :items="ruleItems" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">{{ $t('common.cancel') }}</UButton>
          <UButton :loading="saving" @click="save">{{ $t('common.save') }}</UButton>
        </div>
      </template>
    </USlideover>
  </div>
</template>