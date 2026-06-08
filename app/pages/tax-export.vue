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
  missing: { id: number; date: string; vendor: string; title: string; grossRappen: number }[]
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
const year = ref(now.getFullYear())

const { data, refresh } = await useFetch<Summary>(
  () => `/api/tax-export/summary?year=${year.value}`,
  { default: () => null as unknown as Summary }
)

// If the chosen year has no data, fall back to the most recent year that does.
watchEffect(() => {
  const years = data.value?.years ?? []
  if (years.length && !years.includes(year.value)) year.value = years[0]!
})

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function fmtDate(iso: string) {
  const [y, m, d] = (iso || '').split('-')
  return d ? `${d}.${m}.${y}` : iso
}

function download() {
  window.location.href = `/api/tax-export/${year.value}`
}

// Attach a receipt to a missing expense right here; refresh removes it from the
// list and unlocks the download once everything has a Beleg.
const fileInput = ref<HTMLInputElement>()
const uploadTarget = ref<number | null>(null)
const uploading = ref(false)
function addReceipt(id: number) {
  uploadTarget.value = id
  fileInput.value?.click()
}
async function onReceipt(e: Event) {
  const files = (e.target as HTMLInputElement).files
  const id = uploadTarget.value
  if (fileInput.value) fileInput.value.value = ''
  if (!files?.length || !id) return
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  uploading.value = true
  try {
    await $fetch(`/api/expenses/${id}/attachments`, { method: 'POST', body: fd })
    await refresh()
  } finally {
    uploading.value = false
    uploadTarget.value = null
  }
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

        <!-- Receipts: complete vs the list of expenses still missing one -->
        <div v-if="!data.missingReceipts" class="tax-receipts">
          <UIcon name="i-lucide-check" class="tax-ok size-4" />
          <span>{{ $t('taxExport.allReceipts', { n: data.receiptCount }) }}</span>
        </div>
        <div v-else class="tax-missing">
          <div class="tax-missing__head">
            <UIcon name="i-lucide-triangle-alert" class="tax-warn size-4" />
            <span class="tax-warn">{{ $t('taxExport.missing', { n: data.missingReceipts }) }}</span>
            <NuxtLink to="/expenses" class="tax-missing__link">
              {{ $t('taxExport.fixReceipts') }}
            </NuxtLink>
          </div>
          <ul class="tax-missing__list">
            <li v-for="m in data.missing" :key="m.id">
              <span class="mono note">{{ fmtDate(m.date) }}</span>
              <span class="tax-missing__name">{{ m.vendor || m.title }}</span>
              <span class="mono">CHF {{ chf(m.grossRappen) }}</span>
              <button
                type="button"
                class="tax-missing__add"
                :disabled="uploading"
                @click="addReceipt(m.id)"
              >
                <UIcon name="i-lucide-upload" class="size-3" /> {{ $t('taxExport.addReceipt') }}
              </button>
            </li>
          </ul>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept="application/pdf,image/*"
            class="hidden"
            @change="onReceipt"
          />
        </div>

        <div class="tax-actions">
          <button
            class="ed-btn"
            type="button"
            :disabled="data.missingReceipts > 0"
            @click="download"
          >
            <UIcon name="i-lucide-download" class="size-3.5" /> {{ $t('taxExport.download') }}
          </button>
          <span class="note">
            {{ data.missingReceipts ? $t('taxExport.blockedHint') : $t('taxExport.bundleHint') }}
          </span>
        </div>
      </UiCard>
    </template>
  </div>
</template>
