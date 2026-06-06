<script setup lang="ts">
interface Tx {
  id: number
  import_id: number
  booking_date: string
  value_date: string | null
  amount_rappen: number
  currency: string
  reference: string | null
  end_to_end_id: string | null
  debtor_name: string | null
  status: 'unmatched' | 'suggested' | 'matched' | 'ignored'
  invoice_id: number | null
  invoice_number: string | null
  invoice_status: string | null
  customer_name: string | null
}
interface BankImport {
  id: number
  filename: string
  iban: string
  statement_id: string | null
  from_date: string | null
  to_date: string | null
  tx_count: number
  created_at: string
  matched_count: number
}
interface InvoiceLite {
  id: number
  number: string
  title: string
  status: string
  customer_name: string
  total_rappen: number
}
interface ImportSummary {
  importId: number
  total: number
  inserted: number
  duplicates: number
  autoMatched: number
  suggested: number
  unmatched: number
}
interface BankConnection {
  id: number
  iban: string
  provider: 'folder' | 'ebics'
  status: 'pending' | 'active' | 'disabled' | 'error'
  config: Record<string, string>
  keysReady?: boolean
  last_sync_at: string | null
  last_status: 'ok' | 'error' | null
  last_error: string | null
  last_summary: { imported: number; autoMatched: number; errors: string[] } | null
}

const { t } = useI18n()
const toast = useToast()

const { data: txData, refresh: refreshTx } = await useFetch<{ transactions: Tx[] }>(
  '/api/bank/transactions',
  { default: () => ({ transactions: [] }) }
)
const { data: importData, refresh: refreshImports } = await useFetch<{ imports: BankImport[] }>(
  '/api/bank/imports',
  { default: () => ({ imports: [] }) }
)
const { data: invoices } = await useFetch<InvoiceLite[]>('/api/invoices', { default: () => [] })
const { data: connData, refresh: refreshConn } = await useFetch<{
  connection: BankConnection | null
}>('/api/bank/connection', { default: () => ({ connection: null }) })
const connection = computed(() => connData.value.connection)

const transactions = computed(() => txData.value.transactions)
// Suggestions first (they point at an invoice), then the unmatched the owner
// must pair by hand.
const queue = computed(() => [
  ...transactions.value.filter((tx) => tx.status === 'suggested'),
  ...transactions.value.filter((tx) => tx.status === 'unmatched')
])
const matched = computed(() => transactions.value.filter((tx) => tx.status === 'matched'))
const ignored = computed(() => transactions.value.filter((tx) => tx.status === 'ignored'))

// Tabs keep the page calm: the review queue, the import history, and the
// connection config are three separate surfaces instead of one long scroll.
const tab = ref<'review' | 'imports' | 'config'>('review')
const tabOptions = computed(() => [
  {
    value: 'review',
    label: queue.value.length
      ? `${t('banking.tabReview')} · ${queue.value.length}`
      : t('banking.tabReview')
  },
  { value: 'imports', label: t('banking.tabImports') },
  { value: 'config', label: t('banking.tabConfig') }
])

const openInvoices = computed(() => invoices.value.filter((i) => i.status === 'sent'))
const invoiceItems = computed(() =>
  openInvoices.value.map((i) => ({
    label: `${i.number || '—'} · ${i.customer_name} · CHF ${chf(i.total_rappen)}`,
    value: i.id
  }))
)

// --- import ---------------------------------------------------------------
const lastSummary = ref<ImportSummary | null>(null)
const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

async function importFile(file: File) {
  const body = new FormData()
  body.append('file', file)
  uploading.value = true
  try {
    const res = await $fetch<{ ok: boolean; summary: ImportSummary }>('/api/bank/import', {
      method: 'POST',
      body
    })
    lastSummary.value = res.summary
    toast.add({ title: t('banking.importDone'), color: 'success' })
    await Promise.all([refreshTx(), refreshImports()])
    // Jump to the review tab so the freshly imported items (and the summary)
    // are in view rather than hidden behind the Imports tab.
    tab.value = 'review'
  } catch (err) {
    toast.add({
      title: t('banking.importError'),
      description: errMessage(err),
      color: 'error'
    })
  } finally {
    uploading.value = false
  }
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) importFile(file)
  if (fileInput.value) fileInput.value.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) importFile(file)
}

// --- review actions -------------------------------------------------------
// Per-transaction invoice override, defaulting to whatever the matcher
// suggested. Lets the owner repoint a suggestion before confirming.
const chosen = reactive<Record<number, number | undefined>>({})
function invoiceForTx(tx: Tx): number | undefined {
  return chosen[tx.id] ?? tx.invoice_id ?? undefined
}
function setChosen(txId: number, value: unknown) {
  chosen[txId] = typeof value === 'number' ? value : undefined
}

// The matcher doesn't persist *why* it suggested, so derive a label from the
// data the same way it decided (see docs/BANK_RECONCILIATION.md).
function reasonFor(tx: Tx): string | null {
  if (tx.status !== 'suggested') return null
  if (!tx.reference) return t('banking.reasonFuzzy')
  const inv = invoices.value.find((i) => i.id === tx.invoice_id)
  if (inv && inv.status !== 'sent') return t('banking.reasonUnsent')
  if (inv && inv.total_rappen !== tx.amount_rappen) return t('banking.reasonMismatch')
  return null
}

async function confirm(tx: Tx) {
  const invoiceId = invoiceForTx(tx)
  if (!invoiceId) {
    toast.add({ title: t('banking.pickInvoiceFirst'), color: 'warning' })
    return
  }
  try {
    await $fetch(`/api/bank/transactions/${tx.id}/confirm`, {
      method: 'POST',
      body: { invoice_id: invoiceId }
    })
    toast.add({ title: t('banking.confirmed'), color: 'success' })
    await Promise.all([refreshTx(), refreshImports()])
  } catch (err) {
    toast.add({ title: t('banking.actionError'), description: errMessage(err), color: 'error' })
  }
}
async function ignore(tx: Tx) {
  try {
    await $fetch(`/api/bank/transactions/${tx.id}/ignore`, { method: 'POST' })
    await Promise.all([refreshTx(), refreshImports()])
  } catch (err) {
    toast.add({ title: t('banking.actionError'), description: errMessage(err), color: 'error' })
  }
}
async function removeImport(imp: BankImport) {
  try {
    await $fetch(`/api/bank/imports/${imp.id}`, { method: 'DELETE' })
    await Promise.all([refreshTx(), refreshImports()])
  } catch (err) {
    toast.add({ title: t('banking.deleteBlocked'), description: errMessage(err), color: 'error' })
  }
}

// --- connection (automatic sync) ------------------------------------------
const connOpen = ref(false)
const connSaving = ref(false)
const connSyncing = ref(false)
const connForm = reactive({
  provider: 'folder' as 'folder' | 'ebics',
  dir: '',
  version: 'H005' as 'H004' | 'H005',
  hostURL: '',
  hostId: '',
  partnerId: '',
  userId: ''
})

function openConnManage() {
  const c = connection.value
  connForm.provider = c?.provider ?? 'folder'
  connForm.dir = c?.config?.dir ?? ''
  connForm.version = (c?.config?.version as 'H004' | 'H005') ?? 'H005'
  connForm.hostURL = c?.config?.hostURL ?? ''
  connForm.hostId = c?.config?.hostId ?? ''
  connForm.partnerId = c?.config?.partnerId ?? ''
  connForm.userId = c?.config?.userId ?? ''
  connOpen.value = true
}

// Open the signed INI letter in a new tab to print and send to the bank.
function openIniLetter() {
  window.open('/api/bank/connection/ini-letter', '_blank')
}

async function saveConnection() {
  const config =
    connForm.provider === 'folder'
      ? { dir: connForm.dir }
      : {
          version: connForm.version,
          hostURL: connForm.hostURL,
          hostId: connForm.hostId,
          partnerId: connForm.partnerId,
          userId: connForm.userId
        }
  connSaving.value = true
  try {
    await $fetch('/api/bank/connection', {
      method: 'POST',
      body: { provider: connForm.provider, config }
    })
    toast.add({ title: t('banking.connSaved'), color: 'success' })
    connOpen.value = false
    await refreshConn()
  } catch (err) {
    toast.add({ title: t('banking.connSaveError'), description: errMessage(err), color: 'error' })
  } finally {
    connSaving.value = false
  }
}

async function syncNow() {
  connSyncing.value = true
  try {
    const res = await $fetch<{
      ok: boolean
      result: { imported: number; autoMatched: number; errors: string[] }
    }>('/api/bank/connection/sync', { method: 'POST' })
    if (res.ok) {
      toast.add({
        title: t('banking.connSyncDone', {
          imported: res.result.imported,
          auto: res.result.autoMatched
        }),
        color: 'success'
      })
    } else {
      toast.add({
        title: t('banking.connSyncFail'),
        description: res.result.errors.join('; '),
        color: 'error'
      })
    }
    await Promise.all([refreshConn(), refreshTx(), refreshImports()])
  } catch (err) {
    toast.add({ title: t('banking.connSyncFail'), description: errMessage(err), color: 'error' })
  } finally {
    connSyncing.value = false
  }
}

async function disconnect() {
  try {
    await $fetch('/api/bank/connection', { method: 'DELETE' })
    toast.add({ title: t('banking.connDisconnected'), color: 'success' })
    await refreshConn()
  } catch (err) {
    toast.add({ title: t('banking.actionError'), description: errMessage(err), color: 'error' })
  }
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
function errMessage(err: unknown): string {
  return (
    (err as { data?: { statusMessage?: string }; statusMessage?: string })?.data?.statusMessage ??
    (err as { statusMessage?: string })?.statusMessage ??
    ''
  )
}
</script>

<template>
  <div class="page-banking">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.banking')}`"
      :title="$t('nav.banking')"
      :subtitle="$t('banking.subtitle')"
    >
      <template #actions>
        <button class="ed-btn-primary" :disabled="uploading" @click="fileInput?.click()">
          <UIcon name="i-lucide-upload" class="size-3.5" /> {{ $t('banking.import') }}
        </button>
      </template>
    </UiPageHead>

    <!-- Always present so the header Import button works from any tab. -->
    <input
      ref="fileInput"
      type="file"
      accept=".xml,application/xml,text/xml"
      class="drop__file"
      @change="onPick"
    />

    <div class="page-banking__tabs">
      <UiSegmentedControl
        :model-value="tab"
        :options="tabOptions"
        :aria-label="$t('nav.banking')"
        @update:model-value="(v: string) => (tab = v as typeof tab)"
      />
    </div>

    <!-- Configuration tab: the automatic-sync connection -->
    <div v-if="tab === 'config'" class="conn">
      <div class="conn__icon">
        <UIcon :name="connection ? 'i-lucide-link' : 'i-lucide-link-2-off'" class="size-4" />
      </div>
      <div class="conn__body">
        <div class="conn__title">{{ $t('banking.connTitle') }}</div>
        <template v-if="connection">
          <div class="conn__meta">
            <span class="conn__status" :class="connection.status">
              {{ $t(`banking.connStatus_${connection.status}`) }}
            </span>
            <span class="conn__via">{{ $t(`banking.connProvider_${connection.provider}`) }}</span>
            <span class="conn__sync mono">
              {{ $t('banking.connLastSync') }}:
              {{
                connection.last_sync_at
                  ? dateCh(connection.last_sync_at.slice(0, 10))
                  : $t('banking.connNever')
              }}
            </span>
          </div>
          <div v-if="connection.last_error" class="conn__err">{{ connection.last_error }}</div>
        </template>
        <div v-else class="conn__meta">{{ $t('banking.connNone') }}</div>
      </div>
      <div class="conn__actions">
        <template v-if="connection">
          <button
            v-if="connection.provider === 'folder'"
            class="ed-btn-ghost"
            :disabled="connSyncing"
            @click="syncNow"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3.5" :class="{ spin: connSyncing }" />
            {{ $t('banking.connSyncNow') }}
          </button>
          <button class="ed-btn-ghost" @click="openConnManage">
            {{ $t('banking.connManage') }}
          </button>
          <button class="ed-btn-ghost" @click="disconnect">
            {{ $t('banking.connDisconnect') }}
          </button>
        </template>
        <button v-else class="ed-btn-primary" @click="openConnManage">
          <UIcon name="i-lucide-link" class="size-3.5" /> {{ $t('banking.connConnect') }}
        </button>
      </div>
    </div>

    <!-- Imports tab: drop zone (history is rendered further down) -->
    <div
      v-if="tab === 'imports'"
      class="drop"
      :class="{ 'is-drag': dragging, 'is-busy': uploading }"
      @click="fileInput?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <UIcon
        :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-file-up'"
        class="drop__icon"
        :class="{ spin: uploading }"
      />
      <span class="drop__hint">{{
        uploading ? $t('banking.importing') : $t('banking.dropHint')
      }}</span>
    </div>

    <!-- Review tab -->
    <template v-if="tab === 'review'">
      <!-- post-import summary banner -->
      <div v-if="lastSummary" class="summary">
        <UIcon name="i-lucide-check-check" class="size-4" />
        <span>
          {{
            $t('banking.summary', {
              total: lastSummary.total,
              auto: lastSummary.autoMatched,
              suggested: lastSummary.suggested,
              unmatched: lastSummary.unmatched
            })
          }}
          <template v-if="lastSummary.duplicates">
            · {{ $t('banking.summaryDuplicates', { n: lastSummary.duplicates }) }}
          </template>
        </span>
      </div>

      <!-- review queue -->
      <UiCard>
        <EmptyState
          v-if="!queue.length"
          :bordered="false"
          icon="i-lucide-check-circle-2"
          :title="$t('banking.queueEmptyTitle')"
          :description="$t('banking.queueEmptyText')"
        />
        <ul v-else class="tx-list">
          <li v-for="tx in queue" :key="tx.id" class="tx" :class="tx.status">
            <div class="tx__amount mono">CHF {{ chf(tx.amount_rappen) }}</div>
            <div class="tx__info">
              <div class="tx__line">
                <span class="tx__debtor">{{ tx.debtor_name || $t('banking.unknownDebtor') }}</span>
                <span class="tx__date mono">{{ dateCh(tx.booking_date) }}</span>
              </div>
              <div class="tx__sub">
                <span v-if="reasonFor(tx)" class="tx__reason">{{ reasonFor(tx) }}</span>
                <span v-if="tx.reference" class="tx__ref mono">{{ tx.reference }}</span>
              </div>
            </div>
            <div class="tx__match">
              <USelect
                :model-value="invoiceForTx(tx)"
                :items="invoiceItems"
                value-key="value"
                :placeholder="$t('banking.pickInvoice')"
                icon="i-lucide-file-text"
                class="tx__select"
                @update:model-value="setChosen(tx.id, $event)"
              />
            </div>
            <div class="tx__actions">
              <button
                class="icon-btn is-good"
                :title="$t('banking.confirm')"
                :aria-label="$t('banking.confirm')"
                @click="confirm(tx)"
              >
                <UIcon name="i-lucide-check" />
              </button>
              <button
                class="icon-btn"
                :title="$t('banking.ignore')"
                :aria-label="$t('banking.ignore')"
                @click="ignore(tx)"
              >
                <UIcon name="i-lucide-ban" />
              </button>
            </div>
          </li>
        </ul>
      </UiCard>

      <!-- auto-matched (collapsed) -->
      <details v-if="matched.length" class="fold">
        <summary class="fold__head">
          <UIcon name="i-lucide-chevron-right" class="fold__chev" />
          <span>{{ $t('banking.matchedTitle') }}</span>
          <span class="fold__count mono">{{ matched.length }}</span>
        </summary>
        <UiCard>
          <table class="ed-table">
            <thead>
              <tr>
                <th>{{ $t('common.date') }}</th>
                <th>{{ $t('banking.debtor') }}</th>
                <th>{{ $t('nav.invoices') }}</th>
                <th class="right">{{ $t('common.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in matched" :key="tx.id">
                <td class="mono">{{ dateCh(tx.booking_date) }}</td>
                <td>{{ tx.debtor_name || '—' }}</td>
                <td>
                  <NuxtLink
                    v-if="tx.invoice_id"
                    :to="`/invoices/${tx.invoice_id}`"
                    class="tx__link"
                  >
                    {{ tx.invoice_number || `#${tx.invoice_id}` }}
                    <span v-if="tx.customer_name" class="muted">· {{ tx.customer_name }}</span>
                  </NuxtLink>
                  <span v-else class="muted">—</span>
                </td>
                <td class="right mono">CHF {{ chf(tx.amount_rappen) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>
      </details>

      <!-- ignored (collapsed) -->
      <details v-if="ignored.length" class="fold">
        <summary class="fold__head">
          <UIcon name="i-lucide-chevron-right" class="fold__chev" />
          <span>{{ $t('banking.ignoredTitle') }}</span>
          <span class="fold__count mono">{{ ignored.length }}</span>
        </summary>
        <UiCard>
          <table class="ed-table">
            <thead>
              <tr>
                <th>{{ $t('common.date') }}</th>
                <th>{{ $t('banking.debtor') }}</th>
                <th class="right">{{ $t('common.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in ignored" :key="tx.id">
                <td class="mono">{{ dateCh(tx.booking_date) }}</td>
                <td>{{ tx.debtor_name || '—' }}</td>
                <td class="right mono">CHF {{ chf(tx.amount_rappen) }}</td>
              </tr>
            </tbody>
          </table>
        </UiCard>
      </details>
    </template>

    <!-- Imports tab: history -->
    <template v-if="tab === 'imports' && importData.imports.length">
      <UiSectionLabel>{{ $t('banking.historyTitle') }}</UiSectionLabel>
      <UiCard>
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('common.date') }}</th>
              <th>{{ $t('banking.file') }}</th>
              <th>{{ $t('banking.period') }}</th>
              <th class="right">{{ $t('banking.txCountCol') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="imp in importData.imports" :key="imp.id">
              <td class="mono">{{ dateCh(imp.created_at.slice(0, 10)) }}</td>
              <td class="tx__file">{{ imp.filename }}</td>
              <td class="mono muted">
                <template v-if="imp.from_date"
                  >{{ dateCh(imp.from_date) }} → {{ dateCh(imp.to_date) }}</template
                >
                <template v-else>—</template>
              </td>
              <td class="right mono">{{ imp.tx_count }}</td>
              <td class="actions">
                <button
                  class="icon-btn"
                  :title="
                    imp.matched_count
                      ? $t('banking.deleteBlockedHint', { n: imp.matched_count })
                      : $t('banking.deleteImport')
                  "
                  :aria-label="$t('banking.deleteImport')"
                  :disabled="imp.matched_count > 0"
                  @click="removeImport(imp)"
                >
                  <UIcon name="i-lucide-trash-2" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>
    </template>

    <!-- connection manage slideover -->
    <USlideover
      v-model:open="connOpen"
      :title="$t('banking.connTitle')"
      :ui="{ content: 'max-w-full sm:max-w-lg' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <p class="conn__intro">{{ $t('banking.connIntro') }}</p>

          <!-- Provider as two descriptive cards: folder/upload is the practical
               default, EBICS is the advanced direct-protocol path. -->
          <div class="prov-grid">
            <button
              type="button"
              class="prov-card"
              :class="{ 'is-active': connForm.provider === 'folder' }"
              @click="connForm.provider = 'folder'"
            >
              <div class="prov-card__top">
                <UIcon name="i-lucide-folder-down" class="prov-card__icon" />
                <span class="prov-card__badge is-rec">{{ $t('banking.connRecommended') }}</span>
              </div>
              <div class="prov-card__name">{{ $t('banking.connProvider_folder') }}</div>
              <div class="prov-card__desc">{{ $t('banking.connProviderFolderDesc') }}</div>
            </button>
            <button
              type="button"
              class="prov-card"
              :class="{ 'is-active': connForm.provider === 'ebics' }"
              @click="connForm.provider = 'ebics'"
            >
              <div class="prov-card__top">
                <UIcon name="i-lucide-landmark" class="prov-card__icon" />
                <span class="prov-card__badge">{{ $t('banking.connAdvanced') }}</span>
              </div>
              <div class="prov-card__name">{{ $t('banking.connProvider_ebics') }}</div>
              <div class="prov-card__desc">{{ $t('banking.connProviderEbicsDesc') }}</div>
            </button>
          </div>

          <template v-if="connForm.provider === 'folder'">
            <UFormField
              :label="$t('banking.connFolderDir')"
              :description="$t('banking.connFolderHint')"
            >
              <UInput v-model="connForm.dir" placeholder="data/bank-inbox" class="w-full" />
            </UFormField>
            <div class="conn__hint">
              <UIcon name="i-lucide-info" class="size-3.5" />
              {{ $t('banking.connFolderUploadHint') }}
            </div>
          </template>

          <template v-else>
            <ol class="conn__steps">
              <li>{{ $t('banking.connEbicsStep1') }}</li>
              <li>{{ $t('banking.connEbicsStep2') }}</li>
              <li>{{ $t('banking.connEbicsStep3') }}</li>
              <li>{{ $t('banking.connEbicsStep4') }}</li>
            </ol>
            <UFormField :label="$t('banking.connEbicsVersion')">
              <USelect
                v-model="connForm.version"
                :items="[
                  { label: 'EBICS 3.0 (H005)', value: 'H005' },
                  { label: 'EBICS 2.5 (H004)', value: 'H004' }
                ]"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="$t('banking.connEbicsHostUrl')">
              <UInput
                v-model="connForm.hostURL"
                placeholder="https://ebics.bank.ch/ebics"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="$t('banking.connEbicsHostId')">
              <UInput v-model="connForm.hostId" class="w-full" />
            </UFormField>
            <UFormField :label="$t('banking.connEbicsPartnerId')">
              <UInput v-model="connForm.partnerId" class="w-full" />
            </UFormField>
            <UFormField :label="$t('banking.connEbicsUserId')">
              <UInput v-model="connForm.userId" class="w-full" />
            </UFormField>

            <!-- After the connection is saved, keys exist → offer the INI letter. -->
            <div v-if="connection?.provider === 'ebics' && connection?.keysReady" class="conn__ini">
              <div class="conn__ini-head">{{ $t('banking.connEbicsActivation') }}</div>
              <p class="conn__ini-text">{{ $t('banking.connEbicsActivationHint') }}</p>
              <button class="ed-btn" type="button" @click="openIniLetter">
                <UIcon name="i-lucide-printer" class="size-3.5" />
                {{ $t('banking.connEbicsIniLetter') }}
              </button>
            </div>

            <p class="conn__docs">
              <UIcon name="i-lucide-book-open" class="size-3" /> {{ $t('banking.connDocsHint') }}
            </p>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="connOpen = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="connSaving" @click="saveConnection">
            {{ $t('common.save') }}
          </button>
        </div>
      </template>
    </USlideover>
  </div>
</template>
