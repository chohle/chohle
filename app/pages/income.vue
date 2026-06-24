<script setup lang="ts">
const cantons = [
  'ZH',
  'BE',
  'LU',
  'UR',
  'SZ',
  'OW',
  'NW',
  'GL',
  'ZG',
  'FR',
  'SO',
  'BS',
  'BL',
  'SH',
  'AR',
  'AI',
  'SG',
  'GR',
  'AG',
  'TG',
  'TI',
  'VD',
  'VS',
  'NE',
  'GE',
  'JU'
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
const { data, error, refresh } = await useFetch<{ month: string; sources: IncomeSource[] }>(
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

const formRef = ref()
function validate(state: typeof form) {
  const errors: { name: string; message: string }[] = []
  if (!state.company.trim()) errors.push({ name: 'company', message: t('validation.required') })
  if (state.salary == null) errors.push({ name: 'salary', message: t('validation.required') })
  else if (state.salary <= 0) errors.push({ name: 'salary', message: t('validation.positive') })
  return errors
}
async function save() {
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
    if (form.id) await $fetch(`/api/income/sources/${form.id}`, { method: 'PUT', body })
    else await $fetch('/api/income/sources', { method: 'POST', body })
    open.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}
const confirm = useConfirm()
async function remove(id: number) {
  if (!(await confirm())) return
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

const totalMonth = computed(() => data.value.sources.reduce((s, x) => s + x.salary_rappen, 0))
const totalPaid = computed(() =>
  data.value.sources.filter((s) => s.paid).reduce((s, x) => s + x.salary_rappen, 0)
)
const totalPending = computed(() => totalMonth.value - totalPaid.value)
</script>

<template>
  <div class="page-income">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.income')}`"
      :title="$t('nav.income')"
      :subtitle="$t('income.subtitle')"
    >
      <template #actions>
        <MonthSelect v-model="month" />
        <button class="ed-btn-primary" @click="openCreate">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('income.add') }}
        </button>
      </template>
    </UiPageHead>

    <UiKpiRow>
      <UiKpiCell
        :label="$t('income.kpiTotalMonth')"
        currency="CHF"
        :value="chf(totalMonth)"
        inverted
      />
      <UiKpiCell :label="$t('common.received')" currency="CHF" :value="chf(totalPaid)" />
      <UiKpiCell :label="$t('common.pending')" currency="CHF" :value="chf(totalPending)" />
      <UiKpiCell :label="$t('income.kpiSources')" :value="String(data.sources.length)" />
    </UiKpiRow>

    <UiSectionLabel>{{ $t('income.recurringSources') }}</UiSectionLabel>

    <UiCard>
      <FetchError v-if="error" :bordered="false" @retry="refresh()" />
      <EmptyState
        v-else-if="!data.sources.length"
        :bordered="false"
        icon="i-lucide-briefcase"
        :title="$t('income.emptyTitle')"
        :description="$t('income.emptyText')"
      >
        <template #action>
          <button class="ed-btn-primary" @click="openCreate">
            <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('income.add') }}
          </button>
        </template>
      </EmptyState>
      <div v-else class="src-grid">
        <article v-for="s in data.sources" :key="s.id" class="src">
          <header class="src-head">
            <div class="src-meta">
              <div class="src-name">{{ s.company }}</div>
              <div v-if="s.job_title" class="src-sub mono">{{ s.job_title }}</div>
            </div>
            <div class="src-actions">
              <button class="icon-btn" @click="openEdit(s)">
                <UIcon name="i-lucide-pencil" />
              </button>
              <button class="icon-btn" @click="remove(s.id)">
                <UIcon name="i-lucide-trash-2" />
              </button>
            </div>
          </header>
          <div class="src-amt tabular">{{ s.currency }} {{ chf(s.salary_rappen) }}</div>
          <div class="src-line mono">
            <span>{{ $t('income.paysOn', { day: s.payout_day }) }}</span>
            <span>· {{ s.canton }}</span>
            <span>· {{ ruleLabel(s.payout_rule) }}</span>
          </div>
          <footer class="src-foot">
            <div>
              <div class="eyebrow">{{ $t('income.paysThisMonth') }}</div>
              <div class="mono pay-date">{{ dateCh(s.pay_date) }}</div>
              <div v-if="s.reason" class="reason mono">
                {{ $t('income.moved') }} · {{ s.reason }}
              </div>
              <div v-else class="reason mono muted">{{ $t('income.onSchedule') }}</div>
            </div>
            <div class="src-pay">
              <UiOutlinedChip :status="s.paid ? 'paid' : 'sent'">
                {{ s.paid ? $t('common.received') : $t('common.pending') }}
              </UiOutlinedChip>
              <button class="link mono" @click="togglePaid(s.id)">
                {{ s.paid ? $t('income.markUnpaid') : $t('income.markPaid') }}
              </button>
            </div>
          </footer>
        </article>
      </div>
    </UiCard>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('income.edit') : $t('income.add')"
      :ui="{ content: 'max-w-full sm:max-w-xl' }"
    >
      <template #body>
        <UForm
          ref="formRef"
          :state="form"
          :validate="validate"
          novalidate
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
          @submit="save"
        >
          <UFormField name="company" :label="$t('income.company')" class="sm:col-span-2">
            <UInput v-model="form.company" class="w-full" />
          </UFormField>
          <UFormField :label="$t('income.jobTitle')" class="sm:col-span-2">
            <UInput v-model="form.jobTitle" class="w-full" />
          </UFormField>
          <UFormField name="salary" :label="$t('income.salary')">
            <UInput v-model.number="form.salary" type="number" step="0.05" class="w-full" />
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
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="saving" @click="formRef?.submit()">
            {{ $t('common.save') }}
          </button>
        </div>
      </template>
    </USlideover>
  </div>
</template>
