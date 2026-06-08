<script setup lang="ts">
interface Summary {
  years: number[]
  year: number
  income: { invoiceRappen: number; salaryRappen: number; totalRappen: number }
  expenseRappen: number
  netRappen: number
  expenseCount: number
  receiptCount: number
  missingReceipts: number
  byCategory: { name: string; totalRappen: number }[]
  vat: {
    registered: boolean
    outputByRate: { rate: number; vatRappen: number }[]
    outputRappen: number
    inputRappen: number
    netVatRappen: number
  }
}

const { t } = useI18n()
const now = new Date()
const year = ref(now.getFullYear() - 1) // default to the last completed year

const { data } = await useFetch<Summary>(() => `/api/tax-export/summary?year=${year.value}`, {
  default: () => null as unknown as Summary
})

// Keep the picker in sync with whatever the server resolved (e.g. first run).
watchEffect(() => {
  if (data.value?.year && !data.value.years.includes(year.value) && data.value.years.length) {
    year.value = data.value.year
  }
})

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function download() {
  window.location.href = `/api/tax-export/${year.value}`
}
</script>

<template>
  <div class="page-tax-export">
    <UiPageHead :title="$t('taxExport.title')">
      <template #subtitle>
        <span class="page-tax-export__sub">{{ $t('taxExport.subtitle') }}</span>
      </template>
    </UiPageHead>

    <div v-if="!data || !data.years.length" class="tax-empty note">
      {{ $t('taxExport.noData') }}
    </div>

    <template v-else>
      <div class="tax-years">
        <button
          v-for="y in data.years"
          :key="y"
          type="button"
          class="tax-year"
          :class="{ 'is-active': y === year }"
          @click="year = y"
        >
          {{ y }}
        </button>
      </div>

      <UiCard class="tax-summary">
        <div class="tax-grid">
          <div class="tax-stat">
            <span class="tax-stat__label">{{ $t('taxExport.income') }}</span>
            <span class="tax-stat__value mono">CHF {{ chf(data.income.totalRappen) }}</span>
            <span class="tax-stat__hint note">
              {{ $t('taxExport.invoices') }} {{ chf(data.income.invoiceRappen) }} ·
              {{ $t('taxExport.salary') }} {{ chf(data.income.salaryRappen) }}
            </span>
          </div>
          <div class="tax-stat">
            <span class="tax-stat__label">{{ $t('taxExport.expenses') }}</span>
            <span class="tax-stat__value mono">CHF {{ chf(data.expenseRappen) }}</span>
            <span class="tax-stat__hint note"
              >{{ data.expenseCount }} {{ $t('taxExport.bookings') }}</span
            >
          </div>
          <div class="tax-stat">
            <span class="tax-stat__label">{{ $t('taxExport.net') }}</span>
            <span class="tax-stat__value mono" :class="{ 'is-neg': data.netRappen < 0 }">
              CHF {{ chf(data.netRappen) }}
            </span>
            <span class="tax-stat__hint note">{{ $t('taxExport.netHint') }}</span>
          </div>
        </div>

        <div v-if="data.vat.registered" class="tax-vat">
          <span class="tax-vat__title">{{ $t('taxExport.vat') }}</span>
          <span class="mono note">
            {{ $t('taxExport.vatOutput') }} {{ chf(data.vat.outputRappen) }} ·
            {{ $t('taxExport.vatInput') }} {{ chf(data.vat.inputRappen) }} ·
            {{ $t('taxExport.vatNet') }} {{ chf(data.vat.netVatRappen) }}
          </span>
        </div>

        <div class="tax-receipts">
          <UIcon
            :name="data.missingReceipts ? 'i-lucide-triangle-alert' : 'i-lucide-check'"
            class="size-4"
            :class="data.missingReceipts ? 'tax-warn' : 'tax-ok'"
          />
          <span v-if="data.missingReceipts" class="tax-warn">
            {{ $t('taxExport.missing', { n: data.missingReceipts }) }}
          </span>
          <span v-else>{{ $t('taxExport.allReceipts', { n: data.receiptCount }) }}</span>
        </div>

        <div class="tax-actions">
          <button class="ed-btn" type="button" @click="download">
            <UIcon name="i-lucide-download" class="size-3.5" /> {{ $t('taxExport.download') }}
          </button>
          <span class="note">{{ $t('taxExport.bundleHint') }}</span>
        </div>
      </UiCard>
    </template>
  </div>
</template>
