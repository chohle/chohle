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
}

const month = ref(new Date().toISOString().slice(0, 7))
const { data, refresh } = await useFetch<{ month: string, sources: IncomeSource[] }>(
  '/api/income/overview',
  { query: { month }, default: () => ({ month: '', sources: [] }) }
)

const ruleItems = [
  { label: 'Pay earlier', value: 'earlier' },
  { label: 'Pay later', value: 'later' },
  { label: 'Leave as is', value: 'none' }
]
const ruleLabel = (r: string) => ruleItems.find((i) => i.value === r)?.label ?? r

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

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('de-CH', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}
</script>

<template>
  <div class="max-w-4xl">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">Income</h1>
        <p class="text-muted mt-1">Salary and jobs with Swiss pay-date calculation.</p>
      </div>
      <div class="flex items-center gap-3">
        <input
          v-model="month"
          type="month"
          class="h-8 rounded border border-default bg-default px-2"
        >
        <UButton icon="i-lucide-plus" @click="openCreate">Add job</UButton>
      </div>
    </div>

    <p v-if="!data.sources.length" class="text-muted text-sm mt-6">No jobs yet.</p>
    <div v-else class="grid sm:grid-cols-2 gap-4 mt-6">
      <UCard v-for="s in data.sources" :key="s.id">
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
          Pays on the {{ s.payout_day }}. · {{ s.canton }} · {{ ruleLabel(s.payout_rule) }}
        </div>
        <div class="mt-3 pt-3 border-t border-default">
          <div class="text-xs text-muted">Pays this month</div>
          <div class="font-medium">{{ formatDate(s.pay_date) }}</div>
          <UBadge v-if="s.reason" color="warning" variant="subtle" size="sm" class="mt-1">
            Moved · {{ s.reason }}
          </UBadge>
          <div v-else class="text-xs text-muted mt-0.5">On the scheduled day</div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="open" :title="form.id ? 'Edit job' : 'Add job'">
      <template #body>
        <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
          <UFormField label="Company" class="col-span-2">
            <UInput v-model="form.company" class="w-full" />
          </UFormField>
          <UFormField label="Job title" class="col-span-2">
            <UInput v-model="form.jobTitle" class="w-full" />
          </UFormField>
          <UFormField label="Monthly salary (CHF)">
            <UInput v-model.number="form.salary" type="number" min="0" step="0.05" class="w-full" />
          </UFormField>
          <UFormField label="Payout day">
            <UInput v-model.number="form.payoutDay" type="number" min="1" max="31" class="w-full" />
          </UFormField>
          <UFormField label="Canton">
            <USelect v-model="form.canton" :items="cantons" class="w-full" />
          </UFormField>
          <UFormField label="Adjustment">
            <USelect v-model="form.payoutRule" :items="ruleItems" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>