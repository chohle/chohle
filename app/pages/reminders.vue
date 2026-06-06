<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'

// The preview body is owner-authored template HTML with customer fields
// substituted in; sanitize before binding via v-html, same as the inbound
// email renderers in conversations.vue / ProjectDetailView.vue.
function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

interface ReminderRow {
  invoice_id: number
  number: string
  issue_date: string
  due_date: string
  total_rappen: number
  customer_id: number
  customer_name: string
  customer_email: string | null
  sent_count: number
  last_reminder_at: string | null
  days_overdue: number
  next_level: 1 | 2 | 3 | null
  eligible: boolean
  wait_days_remaining: number | null
}

const { t } = useI18n()
const toast = useToast()

const { data: rows, refresh } = await useFetch<ReminderRow[]>('/api/reminders', {
  default: () => []
})

const eligible = computed(() => (rows.value ?? []).filter((r) => r.eligible))
const waiting = computed(() => (rows.value ?? []).filter((r) => !r.eligible))

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

const eligibleTotal = computed(() => eligible.value.reduce((s, r) => s + r.total_rappen, 0))
const waitingTotal = computed(() => waiting.value.reduce((s, r) => s + r.total_rappen, 0))

// Preview modal state
const preview = ref<{
  open: boolean
  row: ReminderRow | null
  subject: string
  body: string
  level: 1 | 2 | 3 | null
  loading: boolean
  sending: boolean
}>({
  open: false,
  row: null,
  subject: '',
  body: '',
  level: null,
  loading: false,
  sending: false
})

async function openPreview(row: ReminderRow) {
  if (row.next_level === null) return
  preview.value = {
    open: true,
    row,
    subject: '',
    body: '',
    level: row.next_level,
    loading: true,
    sending: false
  }
  try {
    const r = await $fetch<{ subject: string; body: string; level: 1 | 2 | 3 }>(
      `/api/invoices/${row.invoice_id}/remind`,
      { method: 'POST', body: { previewOnly: true } }
    )
    preview.value.subject = r.subject
    preview.value.body = r.body
    preview.value.level = r.level
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('reminders.previewFailed')
    toast.add({ title: msg, color: 'error' })
    preview.value.open = false
  } finally {
    preview.value.loading = false
  }
}

async function confirmSend() {
  const row = preview.value.row
  if (!row) return
  preview.value.sending = true
  try {
    const r = await $fetch<{ level: 1 | 2 | 3 }>(`/api/invoices/${row.invoice_id}/remind`, {
      method: 'POST',
      body: {}
    })
    toast.add({
      title: t('reminders.sentLevel', { level: r.level, number: row.number }),
      color: 'success'
    })
    preview.value.open = false
    await refresh()
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('reminders.sendFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    preview.value.sending = false
  }
}

function levelLabel(level: 1 | 2 | 3 | null) {
  if (level === 1) return t('reminders.level1')
  if (level === 2) return t('reminders.level2')
  if (level === 3) return t('reminders.level3')
  return t('reminders.exhausted')
}
</script>

<template>
  <div class="page-reminders">
    <UiPageHead
      :crumb="`${$t('nav.finance')} / ${$t('nav.reminders')}`"
      :title="$t('reminders.title')"
      :subtitle="$t('reminders.subtitle')"
    />

    <UiKpiRow :cols="3">
      <UiKpiCell :label="$t('reminders.eligibleCount')" :value="String(eligible.length)" inverted />
      <UiKpiCell
        :label="$t('reminders.eligibleTotal')"
        currency="CHF"
        :value="chf(eligibleTotal)"
      />
      <UiKpiCell :label="$t('reminders.waitingTotal')" currency="CHF" :value="chf(waitingTotal)" />
    </UiKpiRow>

    <UiSectionLabel>{{ $t('reminders.readyHeader') }}</UiSectionLabel>
    <UiCard>
      <EmptyState
        v-if="!eligible.length"
        :bordered="false"
        icon="i-lucide-bell-off"
        :title="$t('reminders.emptyReadyTitle')"
        :description="$t('reminders.emptyReadyText')"
      />
      <div v-else class="ed-scroll">
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('reminders.colInvoice') }}</th>
              <th>{{ $t('reminders.colCustomer') }}</th>
              <th>{{ $t('reminders.colDue') }}</th>
              <th class="right">{{ $t('reminders.colOverdue') }}</th>
              <th class="right">{{ $t('reminders.colAmount') }}</th>
              <th>{{ $t('reminders.colNextLevel') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in eligible" :key="r.invoice_id" class="row">
              <td class="mono">
                <NuxtLink :to="`/invoices/${r.invoice_id}`">{{ r.number }}</NuxtLink>
              </td>
              <td>
                <NuxtLink :to="`/customers/${r.customer_id}`">{{ r.customer_name }}</NuxtLink>
              </td>
              <td class="mono">{{ dateCh(r.due_date) }}</td>
              <td class="right mono">{{ r.days_overdue }} {{ $t('reminders.daysShort') }}</td>
              <td class="right mono">CHF {{ chf(r.total_rappen) }}</td>
              <td>
                <span class="level-pill mono">{{ levelLabel(r.next_level) }}</span>
              </td>
              <td class="right">
                <button class="ed-btn-primary" type="button" @click="openPreview(r)">
                  <UIcon name="i-lucide-send" class="size-3.5" />
                  {{ $t('reminders.preview') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UiSectionLabel>{{ $t('reminders.waitingHeader') }}</UiSectionLabel>
    <UiCard>
      <EmptyState
        v-if="!waiting.length"
        :bordered="false"
        icon="i-lucide-check"
        :title="$t('reminders.emptyWaitingTitle')"
        :description="$t('reminders.emptyWaitingText')"
      />
      <div v-else class="ed-scroll">
        <table class="ed-table">
          <thead>
            <tr>
              <th>{{ $t('reminders.colInvoice') }}</th>
              <th>{{ $t('reminders.colCustomer') }}</th>
              <th>{{ $t('reminders.colDue') }}</th>
              <th class="right">{{ $t('reminders.colOverdue') }}</th>
              <th class="right">{{ $t('reminders.colAmount') }}</th>
              <th>{{ $t('reminders.colState') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in waiting" :key="r.invoice_id" class="row">
              <td class="mono">
                <NuxtLink :to="`/invoices/${r.invoice_id}`">{{ r.number }}</NuxtLink>
              </td>
              <td>
                <NuxtLink :to="`/customers/${r.customer_id}`">{{ r.customer_name }}</NuxtLink>
              </td>
              <td class="mono">{{ dateCh(r.due_date) }}</td>
              <td class="right mono">{{ r.days_overdue }} {{ $t('reminders.daysShort') }}</td>
              <td class="right mono">CHF {{ chf(r.total_rappen) }}</td>
              <td class="mono note">
                <template v-if="r.next_level === null">
                  {{ $t('reminders.exhausted') }}
                </template>
                <template v-else-if="r.wait_days_remaining === 0">
                  {{ $t('reminders.readyToday') }}
                </template>
                <template v-else>
                  {{ levelLabel(r.next_level) }}
                  ·
                  {{
                    $t('reminders.readyInDays', {
                      n: r.wait_days_remaining ?? 0
                    })
                  }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <UModal
      v-model:open="preview.open"
      :title="$t('reminders.previewTitle', { level: preview.level ?? '' })"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div v-if="preview.loading" class="note">{{ $t('reminders.loadingPreview') }}</div>
        <div v-else>
          <div class="preview-row">
            <span class="eyebrow">{{ $t('reminders.previewTo') }}</span>
            <span class="mono">{{ preview.row?.customer_email }}</span>
          </div>
          <div class="preview-row">
            <span class="eyebrow">{{ $t('reminders.previewSubject') }}</span>
            <span>{{ preview.subject }}</span>
          </div>
          <div class="preview-body" v-html="sanitizeHtml(preview.body)" />
          <p class="note mt-3">{{ $t('reminders.previewAttachmentHint') }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" @click="preview.open = false">
            {{ $t('common.cancel') }}
          </button>
          <button
            class="ed-btn-primary"
            :disabled="preview.loading || preview.sending"
            @click="confirmSend"
          >
            <UIcon name="i-lucide-send" class="size-3.5" />
            {{ $t('reminders.confirmSend') }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>
