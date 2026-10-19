<script setup lang="ts">
interface ReceiptRef {
  id: number
  date: string
  vendor: string
  title: string
  grossRappen: number
}

interface Summary {
  years: number[]
  year: number
  income: { invoiceRappen: number; salaryRappen: number; totalRappen: number }
  expenseRappen: number
  netRappen: number
  expenseCount: number
  receiptCount: number
  missingReceipts: number
  missing: ReceiptRef[]
  waived: ReceiptRef[]
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
const toast = useToast()

const now = new Date()
const year = ref(now.getFullYear())
const { data, refresh, error } = await useFetch<Summary>(
  () => `/api/tax-export/summary?year=${year.value}`,
  { default: () => null as unknown as Summary }
)

// If the chosen year has no data, fall back to the most recent year that does.
watchEffect(() => {
  const years = data.value?.years ?? []
  if (years.length && !years.includes(year.value)) year.value = years[0]!
})

// Year picker lives in the page head as a segmented control (string values).
const yearOptions = computed(() =>
  (data.value?.years ?? []).map((y) => ({ value: String(y), label: String(y) }))
)
const yearModel = computed({
  get: () => String(year.value),
  set: (v: string) => {
    year.value = Number(v)
  }
})

/** Format an ISO date as Swiss dd.mm.yyyy. */
function fmtDate(iso: string) {
  const [y, m, d] = (iso || '').split('-')
  return d ? `${d}.${m}.${y}` : iso
}

// --- Numbers -----------------------------------------------------------------

// Income caption: skip the parts that are zero so it doesn't read "Invoices 0.00".
const incomeCaption = computed(() => {
  const d = data.value
  if (!d) return ''
  const parts: string[] = []
  if (d.income.invoiceRappen)
    parts.push(`${t('taxExport.invoices')} ${chf(d.income.invoiceRappen, 2)}`)
  if (d.income.salaryRappen) parts.push(`${t('taxExport.salary')} ${chf(d.income.salaryRappen, 2)}`)
  return parts.join('  ·  ')
})

const categories = computed(() => {
  const d = data.value
  if (!d || !d.expenseRappen) return []
  return d.byCategory.map((c) => ({
    name: c.name === 'Uncategorized' ? t('taxExport.uncategorized') : c.name,
    totalRappen: c.totalRappen,
    share: c.totalRappen / d.expenseRappen
  }))
})

// --- Receipts ----------------------------------------------------------------

const PREVIEW = 5
const showAllMissing = ref(false)
const showWaived = ref(false)

const coveredCount = computed(() => {
  const d = data.value
  return d ? d.expenseCount - d.missingReceipts - d.waived.length : 0
})
const coverage = computed(() => {
  const d = data.value
  if (!d || !d.expenseCount) return 1
  return (coveredCount.value + d.waived.length) / d.expenseCount
})
const visibleMissing = computed(() => {
  const list = data.value?.missing ?? []
  return showAllMissing.value ? list : list.slice(0, PREVIEW)
})

// Attach a receipt to a missing expense right here; refresh removes it from the
// list and unlocks the download once everything has a Beleg.
const fileInput = ref<HTMLInputElement>()
const uploadTarget = ref<number | null>(null)
const busy = ref(false)

/** Open the file picker for a specific missing expense. */
function addReceipt(id: number) {
  uploadTarget.value = id
  fileInput.value?.click()
}

/** Upload the picked receipt(s) to the targeted expense and refresh the list. */
async function onReceipt(e: Event) {
  const files = (e.target as HTMLInputElement).files
  const id = uploadTarget.value
  if (fileInput.value) fileInput.value.value = ''
  if (!files?.length || !id) return
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  busy.value = true
  try {
    await $fetch(`/api/expenses/${id}/attachments`, { method: 'POST', body: fd })
    await refresh()
  } catch {
    toast.add({ title: t('taxExport.uploadFailed'), color: 'error' })
  } finally {
    busy.value = false
    uploadTarget.value = null
  }
}

/** Mark an expense as "no receipt needed" (rent with a contract etc.), or undo. */
async function setWaived(id: number, waived: boolean) {
  busy.value = true
  try {
    await $fetch(`/api/expenses/${id}/receipt-waiver`, { method: 'PUT', body: { waived } })
    await refresh()
  } catch {
    toast.add({ title: t('taxExport.waiverFailed'), color: 'error' })
  } finally {
    busy.value = false
  }
}

// --- Export ------------------------------------------------------------------

const canDownload = computed(() => !!data.value && data.value.missingReceipts === 0)

/** Trigger the ZIP download for the selected year. */
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
      <template v-if="yearOptions.length > 1" #actions>
        <UiSegmentedControl
          v-model="yearModel"
          :options="yearOptions"
          :aria-label="$t('taxExport.yearLabel')"
        />
      </template>
    </UiPageHead>

    <FetchError v-if="error" @retry="refresh()" />
    <div v-else-if="!data || !data.years.length" class="tax-empty note">
      {{ $t('taxExport.noData') }}
    </div>

    <div v-else class="tax-grid">
      <div class="tax-main">
        <UiKpiRow :cols="3">
          <UiKpiCell
            :label="$t('taxExport.income')"
            currency="CHF"
            :value="chf(data.income.totalRappen, 2)"
            :delta="incomeCaption"
          />
          <UiKpiCell
            :label="$t('taxExport.expenses')"
            currency="CHF"
            :value="chf(data.expenseRappen, 2)"
            :delta="`${data.expenseCount} ${$t('taxExport.bookings')}`"
          />
          <UiKpiCell
            :label="$t('taxExport.net')"
            currency="CHF"
            :value="chf(data.netRappen, 2)"
            inverted
            :delta="$t('taxExport.netHint')"
          />
        </UiKpiRow>

        <template v-if="categories.length">
          <UiSectionLabel>{{ $t('taxExport.byCategory') }}</UiSectionLabel>
          <UiCard>
            <ul class="tax-cats">
              <li v-for="c in categories" :key="c.name">
                <span class="tax-cats__name">{{ c.name }}</span>
                <span class="tax-cats__bar"
                  ><span :style="{ width: `${Math.max(2, c.share * 100)}%` }"
                /></span>
                <span class="tax-cats__amount mono tabular">CHF {{ chf(c.totalRappen, 2) }}</span>
                <span class="tax-cats__share mono tabular">{{ Math.round(c.share * 100) }}%</span>
              </li>
            </ul>
          </UiCard>
        </template>

        <div v-if="data.vat.registered" class="tax-vat">
          <span class="tax-vat__title eyebrow">{{ $t('taxExport.vat') }}</span>
          <div class="tax-vat__items">
            <span
              ><span class="note">{{ $t('taxExport.vatOutput') }}</span> CHF
              {{ chf(data.vat.outputRappen, 2) }}</span
            >
            <span
              ><span class="note">{{ $t('taxExport.vatInput') }}</span> CHF
              {{ chf(data.vat.inputRappen, 2) }}</span
            >
            <span class="tax-vat__net"
              ><span class="note">{{ $t('taxExport.vatNet') }}</span> CHF
              {{ chf(data.vat.netVatRappen, 2) }}</span
            >
          </div>
        </div>

        <UiSectionLabel>{{ $t('taxExport.receiptsSection') }}</UiSectionLabel>
        <UiCard class="tax-receipts">
          <div class="tax-receipts__head">
            <span class="tax-receipts__count tabular">
              {{ $t('taxExport.progress', { done: coveredCount, total: data.expenseCount }) }}
            </span>
            <span v-if="data.waived.length" class="tax-receipts__waived">
              {{ $t('taxExport.waivedCount', { n: data.waived.length }) }}
              <button type="button" class="tax-receipts__toggle" @click="showWaived = !showWaived">
                {{ showWaived ? $t('taxExport.hideWaived') : $t('taxExport.showWaived') }}
              </button>
            </span>
          </div>
          <div
            class="tax-receipts__bar"
            role="progressbar"
            :aria-valuenow="Math.round(coverage * 100)"
          >
            <span :style="{ width: `${coverage * 100}%` }" />
          </div>

          <div v-if="!data.missingReceipts" class="tax-receipts__done">
            <UIcon name="i-lucide-circle-check-big" class="tax-ok size-5" />
            <span>{{ $t('taxExport.allReceipts', { n: data.receiptCount }) }}</span>
          </div>

          <ul v-if="data.missingReceipts" class="tax-receipts__list">
            <li v-for="m in visibleMissing" :key="m.id">
              <span class="mono note">{{ fmtDate(m.date) }}</span>
              <span class="tax-receipts__name">{{ m.vendor || m.title }}</span>
              <span class="mono tabular">CHF {{ chf(m.grossRappen, 2) }}</span>
              <button
                type="button"
                class="tax-receipts__btn"
                :disabled="busy"
                @click="addReceipt(m.id)"
              >
                <UIcon name="i-lucide-upload" class="size-3" /> {{ $t('taxExport.addReceipt') }}
              </button>
              <button
                type="button"
                class="tax-receipts__btn"
                :disabled="busy"
                :title="$t('taxExport.noReceiptHint')"
                @click="setWaived(m.id, true)"
              >
                <UIcon name="i-lucide-file-x" class="size-3" /> {{ $t('taxExport.noReceipt') }}
              </button>
            </li>
          </ul>

          <ul v-if="showWaived && data.waived.length" class="tax-receipts__list">
            <li v-for="w in data.waived" :key="w.id" class="is-waived">
              <span class="mono">{{ fmtDate(w.date) }}</span>
              <span class="tax-receipts__name">{{ w.vendor || w.title }}</span>
              <span class="mono tabular">CHF {{ chf(w.grossRappen, 2) }}</span>
              <span class="note">{{ $t('taxExport.noReceipt') }}</span>
              <button
                type="button"
                class="tax-receipts__btn"
                :disabled="busy"
                @click="setWaived(w.id, false)"
              >
                <UIcon name="i-lucide-undo-2" class="size-3" /> {{ $t('taxExport.undoWaiver') }}
              </button>
            </li>
          </ul>

          <div v-if="data.missingReceipts > PREVIEW" class="tax-receipts__foot">
            <button
              type="button"
              class="tax-receipts__toggle"
              @click="showAllMissing = !showAllMissing"
            >
              {{
                showAllMissing
                  ? $t('taxExport.showLess')
                  : $t('taxExport.showAll', { n: data.missingReceipts })
              }}
            </button>
          </div>

          <input
            ref="fileInput"
            type="file"
            multiple
            accept="application/pdf,image/*"
            class="hidden"
            @change="onReceipt"
          />
        </UiCard>
      </div>

      <aside class="tax-side">
        <UiCard class="tax-package">
          <div class="tax-package__title eyebrow">
            <span>{{ $t('taxExport.packageTitle') }}</span>
            <span class="tax-package__year">{{ $t('taxExport.yearLabel') }} {{ data.year }}</span>
          </div>

          <ul class="tax-package__files">
            <li>
              <UIcon name="i-lucide-file-text" />
              <span>
                {{ $t('taxExport.fileReport') }}
                <span class="tax-package__file mono">Steuerexport-{{ data.year }}.pdf</span>
              </span>
            </li>
            <li>
              <UIcon name="i-lucide-table" />
              <span>
                {{ $t('taxExport.fileJournal') }}
                <span class="tax-package__file mono">buchungen-{{ data.year }}.csv</span>
              </span>
            </li>
            <li>
              <UIcon name="i-lucide-folder" />
              <span>
                {{ $t('taxExport.fileReceipts', { n: data.receiptCount }) }}
                <span class="tax-package__file mono">belege/</span>
              </span>
            </li>
          </ul>

          <ul class="tax-package__checks" :aria-label="$t('taxExport.checklist')">
            <li>
              <UIcon name="i-lucide-circle-check" class="is-ok" />
              <span>{{ $t('taxExport.checkBookings', { n: data.expenseCount }) }}</span>
            </li>
            <li v-if="!data.missingReceipts">
              <UIcon name="i-lucide-circle-check" class="is-ok" />
              <span>{{ $t('taxExport.checkReceiptsOk') }}</span>
            </li>
            <li v-else>
              <UIcon name="i-lucide-circle-alert" class="is-warn" />
              <span class="tax-warn">
                {{ $t('taxExport.checkReceiptsMissing', { n: data.missingReceipts }) }}
              </span>
            </li>
            <li v-if="data.vat.registered">
              <UIcon name="i-lucide-circle-check" class="is-ok" />
              <span>{{
                $t('taxExport.checkVatOn', { amount: chf(data.vat.netVatRappen, 2) })
              }}</span>
            </li>
            <li v-else>
              <UIcon name="i-lucide-circle-minus" class="is-muted" />
              <span class="note">{{ $t('taxExport.checkVatOff') }}</span>
            </li>
          </ul>

          <div class="tax-package__action">
            <button class="ed-btn-primary" type="button" :disabled="!canDownload" @click="download">
              <UIcon name="i-lucide-download" class="size-3.5" /> {{ $t('taxExport.download') }}
            </button>
            <span class="note">
              {{ canDownload ? $t('taxExport.bundleHint') : $t('taxExport.blockedHint') }}
            </span>
          </div>
        </UiCard>
      </aside>
    </div>
  </div>
</template>
