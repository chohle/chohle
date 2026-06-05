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

    <!-- connection (automatic sync) -->
    <div class="conn">
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

    <!-- drop zone -->
    <div
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
      <input
        ref="fileInput"
        type="file"
        accept=".xml,application/xml,text/xml"
        class="drop__file"
        @change="onPick"
      />
    </div>

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
    <UiSectionLabel>{{ $t('banking.queueTitle') }}</UiSectionLabel>
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
            <button class="icon-btn is-good" :title="$t('banking.confirm')" @click="confirm(tx)">
              <UIcon name="i-lucide-check" />
            </button>
            <button class="icon-btn" :title="$t('banking.ignore')" @click="ignore(tx)">
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
                <NuxtLink v-if="tx.invoice_id" :to="`/invoices/${tx.invoice_id}`" class="tx__link">
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

    <!-- import history -->
    <template v-if="importData.imports.length">
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
                  >{{ dateCh(imp.from_date) }} – {{ dateCh(imp.to_date) }}</template
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
          <UFormField :label="$t('banking.connProvider')">
            <USelect
              v-model="connForm.provider"
              :items="[
                { label: $t('banking.connProvider_folder'), value: 'folder' },
                { label: $t('banking.connProvider_ebics'), value: 'ebics' }
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <template v-if="connForm.provider === 'folder'">
            <UFormField
              :label="$t('banking.connFolderDir')"
              :description="$t('banking.connFolderHint')"
            >
              <UInput v-model="connForm.dir" placeholder="data/bank-inbox" class="w-full" />
            </UFormField>
          </template>

          <template v-else>
            <div class="conn__note">
              <UIcon name="i-lucide-info" class="size-3.5" /> {{ $t('banking.connEbicsNote') }}
            </div>
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

<style scoped lang="scss">
.page-banking {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.conn {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-subtle, var(--ink-6, #ededf0));
  border-radius: var(--radius, 10px);

  &__icon {
    color: var(--ink-3, #71717a);
  }
  &__body {
    flex: 1;
    min-width: 0;
  }
  &__title {
    font-size: 0.9rem;
    font-weight: 600;
  }
  &__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.15rem;
    font-size: 0.78rem;
    color: var(--ink-2, #52525b);
  }
  &__status {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    background: var(--ink-6, #ededf0);
    color: var(--ink-2);

    &.active {
      background: color-mix(in oklab, var(--success, #16a34a) 16%, transparent);
      color: var(--success, #15803d);
    }
    &.pending {
      background: color-mix(in oklab, var(--warning, #d97706) 16%, transparent);
      color: var(--warning, #b45309);
    }
    &.error {
      background: color-mix(in oklab, var(--error, #dc2626) 16%, transparent);
      color: var(--error, #b91c1c);
    }
  }
  &__sync {
    font-size: 0.72rem;
    color: var(--ink-3);
  }
  &__err {
    margin-top: 0.3rem;
    font-size: 0.72rem;
    color: var(--error, #b91c1c);
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  &__note {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.65rem;
    border-radius: var(--radius, 8px);
    background: color-mix(in oklab, var(--warning, #d97706) 12%, transparent);
    color: var(--warning, #b45309);
    font-size: 0.78rem;
  }

  &__ini {
    margin-top: 0.25rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--border-subtle, var(--ink-6, #ededf0));
    border-radius: var(--radius, 10px);

    &-head {
      font-size: 0.82rem;
      font-weight: 600;
    }
    &-text {
      margin: 0.25rem 0 0.6rem;
      font-size: 0.78rem;
      color: var(--ink-3, #71717a);
    }
  }
}

.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.75rem;
  border: 1.5px dashed var(--border, var(--ink-5, #d4d4d8));
  border-radius: var(--radius-lg, 12px);
  background: var(--surface-2, transparent);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;

  &.is-drag {
    border-color: var(--accent, #6366f1);
    background: color-mix(in oklab, var(--accent, #6366f1) 8%, transparent);
  }
  &.is-busy {
    cursor: progress;
    opacity: 0.7;
  }
  &__icon {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--ink-3, #71717a);
  }
  &__hint {
    font-size: 0.85rem;
    color: var(--ink-2, #52525b);
  }
  &__file {
    display: none;
  }
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius, 10px);
  background: color-mix(in oklab, var(--success, #16a34a) 12%, transparent);
  color: var(--success-ink, var(--success, #15803d));
  font-size: 0.85rem;
}

.tx-list {
  display: flex;
  flex-direction: column;
}
.tx {
  display: grid;
  grid-template-columns: auto 1fr minmax(0, 18rem) auto;
  align-items: center;
  gap: 0.85rem;
  padding: 0.7rem 0.25rem;

  & + .tx {
    border-top: 1px solid var(--border-subtle, var(--ink-6, #ededf0));
  }
  &.unmatched .tx__amount {
    color: var(--ink-1);
  }
  &__amount {
    font-size: 0.95rem;
    font-weight: 600;
    white-space: nowrap;
  }
  &__line {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  &__debtor {
    font-size: 0.9rem;
  }
  &__date {
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  &__sub {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.15rem;
  }
  &__reason {
    font-size: 0.7rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--warning, #d97706) 15%, transparent);
    color: var(--warning-ink, var(--warning, #b45309));
  }
  &__ref {
    font-size: 0.7rem;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__select {
    width: 100%;
  }
  &__actions {
    display: flex;
    gap: 0.25rem;
  }
  &__file {
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__link {
    color: var(--accent, #6366f1);
    &:hover {
      text-decoration: underline;
    }
  }
}
.icon-btn.is-good:hover {
  color: var(--success, #16a34a);
}

.fold {
  border: 1px solid var(--border-subtle, var(--ink-6, #ededf0));
  border-radius: var(--radius, 10px);
  padding: 0 0.75rem;

  &__head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0;
    cursor: pointer;
    font-size: 0.85rem;
    list-style: none;
    &::-webkit-details-marker {
      display: none;
    }
  }
  &__chev {
    transition: transform 0.15s;
  }
  &[open] &__chev {
    transform: rotate(90deg);
  }
  &__count {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--ink-3);
  }
  :deep(.ui-card) {
    margin-bottom: 0.75rem;
  }
}
</style>
