<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'

type Direction = 'sales' | 'procurement'
type SalesStage = 'lead' | 'contacted' | 'proposal' | 'won'
type ProcStage = 'need' | 'requested' | 'received' | 'accepted'
type Stage = SalesStage | ProcStage

interface Deal {
  id: number
  name: string
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  email: string | null
  phone: string | null
  direction: Direction
  stage: Stage
  label: string
  value_rappen: number
  due_date: string | null
  notes: string | null
  position: number
}

interface PipelinePayload {
  direction: Direction
  stages: Record<string, Deal[]>
  totals: Record<string, number>
}

const props = defineProps<{ direction: Direction }>()

const SALES_STAGES: SalesStage[] = ['lead', 'contacted', 'proposal', 'won']
const PROC_STAGES: ProcStage[] = ['need', 'requested', 'received', 'accepted']
const DIR_TO_SLUG: Record<Direction, string> = { sales: 'vertrieb', procurement: 'einkauf' }

const { t } = useI18n()
const toast = useToast()
const route = useRoute()

const direction = props.direction
const STAGES: Stage[] = direction === 'procurement' ? PROC_STAGES : SALES_STAGES
const finalStage: Stage = direction === 'procurement' ? 'accepted' : 'won'

const { data, refresh } = await useFetch<PipelinePayload>('/api/deals', {
  query: { direction },
  key: `deals-${direction}`
})

const board = reactive<Record<Stage, Deal[]>>({} as Record<Stage, Deal[]>)
for (const s of STAGES) board[s] = []

function syncBoard() {
  for (const s of STAGES) board[s] = [...(data.value?.stages[s] ?? [])]
}
syncBoard()
watch(() => data.value, syncBoard)

const stageMeta: Record<Stage, { title: string; dot: string }> = {
  lead: { title: t('pipeline.stage.lead'), dot: 'var(--ink-3)' },
  contacted: { title: t('pipeline.stage.contacted'), dot: 'var(--ink-2)' },
  proposal: { title: t('pipeline.stage.proposal'), dot: 'var(--ink)' },
  won: { title: t('pipeline.stage.won'), dot: 'var(--ink)' },
  need: { title: t('pipeline.stage.need'), dot: 'var(--ink-3)' },
  requested: { title: t('pipeline.stage.requested'), dot: 'var(--ink-2)' },
  received: { title: t('pipeline.stage.received'), dot: 'var(--ink)' },
  accepted: { title: t('pipeline.stage.accepted'), dot: 'var(--ink)' }
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const totals = computed<Record<Stage, number>>(() => {
  const r = {} as Record<Stage, number>
  for (const s of STAGES) r[s] = board[s].reduce((sum, d) => sum + d.value_rappen, 0)
  return r
})

const grandTotal = computed(() => STAGES.reduce((sum, s) => sum + totals.value[s], 0))
const totalCount = computed(() => STAGES.reduce((sum, s) => sum + board[s].length, 0))

let wonBeforeDrag = new Set<number>()
function snapshotFinal() {
  wonBeforeDrag = new Set(board[finalStage].map(d => d.id))
}
snapshotFinal()
watch(() => data.value, snapshotFinal)

const finalModal = ref<{ open: boolean; deal: Deal | null }>({ open: false, deal: null })

async function persistOrder() {
  const stages = Object.fromEntries(
    STAGES.map(s => [s, board[s].map(d => d.id)])
  ) as Record<Stage, number[]>
  try {
    await $fetch('/api/deals/reorder', { method: 'POST', body: { direction, stages } })
    for (const s of STAGES) for (const d of board[s]) d.stage = s

    const movedIn = board[finalStage].find(d => !wonBeforeDrag.has(d.id))
    if (movedIn) finalModal.value = { open: true, deal: movedIn }
    snapshotFinal()
  } catch {
    toast.add({ title: t('pipeline.reorderError'), color: 'error' })
    await refresh()
  }
}

// --- Form ---
interface FormState {
  id: number | null
  name: string
  email: string
  phone: string
  customer_id: number | null
  stage: Stage
  label: string
  value: number | undefined
  due_date: string
  notes: string
}
function blankForm(stage: Stage = STAGES[0]!): FormState {
  return { id: null, name: '', email: '', phone: '', customer_id: null, stage, label: '', value: undefined, due_date: '', notes: '' }
}
const form = reactive<FormState>(blankForm())
const open = ref(false)
const saving = ref(false)

interface CustomerLite { id: number; name: string }
const { data: customers } = await useFetch<CustomerLite[]>('/api/customers', { default: () => [] })
const customerItems = computed(() => [
  { label: t('pipeline.noCustomerLink'), value: null as number | null },
  ...(customers.value ?? []).map(c => ({ label: c.name, value: c.id }))
])

function openCreate(stage?: Stage) {
  Object.assign(form, blankForm(stage ?? STAGES[0]!))
  open.value = true
}
function openEdit(d: Deal) {
  Object.assign(form, {
    id: d.id,
    name: d.name,
    email: d.email ?? '',
    phone: d.phone ?? '',
    customer_id: d.customer_id,
    stage: d.stage,
    label: d.label,
    value: d.value_rappen / 100,
    due_date: d.due_date ?? '',
    notes: d.notes ?? ''
  })
  open.value = true
}

const formRef = ref()
// Basic RFC-ish check — good enough to catch typos like "aadsf" without
// rejecting valid edge cases. Server is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(state: FormState) {
  const errors: { name: string; message: string }[] = []
  if (!state.name.trim()) errors.push({ name: 'name', message: t('validation.required') })
  if (!state.email.trim()) errors.push({ name: 'email', message: t('validation.required') })
  else if (!EMAIL_RE.test(state.email.trim())) errors.push({ name: 'email', message: t('validation.email') })
  if (!state.phone.trim()) errors.push({ name: 'phone', message: t('validation.required') })
  return errors
}

async function save() {
  saving.value = true
  try {
    const validStages = STAGES as readonly Stage[]
    const stage: Stage = validStages.includes(form.stage) ? form.stage : validStages[0]!
    const body = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      customer_id: form.customer_id,
      direction,
      stage,
      label: form.label.trim(),
      value: form.value ?? 0,
      due_date: form.due_date || null,
      notes: form.notes || null
    }
    if (form.id) await $fetch(`/api/deals/${form.id}`, { method: 'PUT', body })
    else await $fetch('/api/deals', { method: 'POST', body })
    open.value = false
    await refresh()
  } finally { saving.value = false }
}

const deleteModal = ref<{ open: boolean; deal: Deal | null }>({ open: false, deal: null })

function confirmDelete(d: Deal) {
  deleteModal.value = { open: true, deal: d }
}

async function performDelete() {
  const d = deleteModal.value.deal
  if (!d) return
  await $fetch(`/api/deals/${d.id}`, { method: 'DELETE' })
  deleteModal.value = { open: false, deal: null }
  await refresh()
}

const completing = ref(false)

async function completeFinal() {
  const d = finalModal.value.deal
  if (!d) return
  completing.value = true
  try {
    if (direction === 'sales') {
      if (!d.customer_id) return
      const { id: invoiceId } = await $fetch<{ id: number }>(
        `/api/customers/${d.customer_id}/invoices`,
        { method: 'POST' }
      )
      finalModal.value = { open: false, deal: null }
      await navigateTo(`/invoices/${invoiceId}`)
    } else {
      const today = new Date().toISOString().slice(0, 10)
      const vendor = d.customer_name || d.name
      const amount = d.value_rappen / 100
      await $fetch('/api/expenses', {
        method: 'POST',
        body: {
          title: d.label || d.name,
          amount: Math.max(amount, 0.01),
          date: today,
          vendor,
          notes: d.notes || null
        }
      })
      toast.add({ title: t('pipeline.expenseLogged'), color: 'success' })
      finalModal.value = { open: false, deal: null }
    }
  } finally { completing.value = false }
}

function dismissFinalModal() {
  finalModal.value = { open: false, deal: null }
}

const stageOptions = computed(() => STAGES.map(s => ({ value: s, label: stageMeta[s].title })))

const directionTabs = computed(() => [
  { label: t('pipeline.direction.sales'), to: '/vertrieb' },
  { label: t('pipeline.direction.procurement'), to: '/einkauf' }
])

const subtitleKey = direction === 'procurement' ? 'pipeline.subtitleProcurement' : 'pipeline.subtitle'
const titleKey = direction === 'procurement' ? 'pipeline.direction.procurement' : 'pipeline.direction.sales'
const crumb = computed(() => {
  const dir = direction === 'procurement' ? t('pipeline.direction.procurement') : t('pipeline.direction.sales')
  return `${t('nav.workspace')} / ${dir}`
})
const newDealLabel = computed(() => direction === 'procurement' ? t('pipeline.newProcurement') : t('pipeline.newDeal'))
const addDealLabel = computed(() => direction === 'procurement' ? t('pipeline.addProcurement') : t('pipeline.addDeal'))

function goToDetail(d: Deal) {
  navigateTo(`/${DIR_TO_SLUG[direction]}/${d.id}`)
}
</script>

<template>
  <div v-if="data" class="page-pipeline">
    <UiPageHead :crumb="crumb" :title="$t(titleKey)">
      <template #subtitle>
        <i18n-t :keypath="subtitleKey" scope="global">
          <template #total><strong class="page-pipeline__strong">CHF {{ chf(grandTotal) }}</strong></template>
          <template #count>{{ totalCount }}</template>
        </i18n-t>
      </template>
      <template #actions>
        <div class="page-pipeline__tabs" role="tablist" :aria-label="$t('pipeline.directionLabel')">
          <NuxtLink
            v-for="tab in directionTabs"
            :key="tab.to"
            :to="tab.to"
            class="page-pipeline__tab mono"
            role="tab"
            :aria-selected="route.path === tab.to"
          >{{ tab.label }}</NuxtLink>
        </div>
        <button class="ed-btn-primary" type="button" @click="openCreate()">
          <UIcon name="i-lucide-plus" class="size-3.5" />
          {{ newDealLabel }}
        </button>
      </template>
    </UiPageHead>

    <div class="page-pipeline__board">
      <div v-for="s in STAGES" :key="s" class="page-pipeline__col">
        <header class="page-pipeline__col-head">
          <div class="page-pipeline__col-title">
            <span class="page-pipeline__dot" :style="{ background: stageMeta[s].dot }" />
            <span class="mono page-pipeline__col-name">{{ stageMeta[s].title }}</span>
            <span class="mono page-pipeline__col-count">{{ board[s].length }}</span>
          </div>
          <span class="mono page-pipeline__col-total">CHF {{ chf(totals[s]) }}</span>
        </header>

        <VueDraggable
          v-model="board[s]"
          :animation="180"
          group="deals"
          ghost-class="page-pipeline__ghost"
          drag-class="page-pipeline__drag"
          :delay-on-touch-only="true"
          :delay="220"
          :touch-start-threshold="5"
          class="page-pipeline__col-body"
          @end="persistOrder"
        >
          <article
            v-for="d in board[s]"
            :key="d.id"
            class="deal-card"
            tabindex="0"
            role="button"
            :aria-label="d.customer_name || d.name"
            @click="goToDetail(d)"
            @keyup.enter="goToDetail(d)"
            @keyup.space.prevent="goToDetail(d)"
          >
            <header class="deal-card__head">
              <h4 class="deal-card__title">{{ d.customer_name || d.name }}</h4>
              <UDropdownMenu
                :items="[
                  [
                    { label: $t('common.edit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(d) },
                    { label: $t('common.delete'), icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(d) }
                  ]
                ]"
              >
                <button type="button" class="icon-btn deal-card__menu" :aria-label="$t('pipeline.menu')" @click.stop>
                  <UIcon name="i-lucide-more-horizontal" />
                </button>
              </UDropdownMenu>
            </header>
            <p v-if="d.label" class="deal-card__label">{{ d.label }}</p>
            <footer class="deal-card__foot">
              <span class="deal-card__value mono">CHF {{ chf(d.value_rappen) }}</span>
              <span v-if="d.due_date" class="deal-card__due mono">
                <UIcon name="i-lucide-calendar" class="size-3" />
                {{ dateCh(d.due_date) }}
              </span>
            </footer>
          </article>

          <div v-if="!board[s].length" class="page-pipeline__placeholder mono">
            {{ $t('pipeline.dropHere') }}
          </div>
        </VueDraggable>

        <button class="page-pipeline__add" type="button" @click="openCreate(s)">
          <UIcon name="i-lucide-plus" class="size-3.5" />
          <span>{{ addDealLabel }}</span>
        </button>
      </div>
    </div>

    <USlideover
      v-model:open="open"
      :title="form.id ? $t('pipeline.editDeal') : newDealLabel"
      :ui="{ content: 'max-w-full sm:max-w-md' }"
    >
      <template #body>
        <UForm ref="formRef" :state="form" :validate="validate" :validate-on="['input', 'blur']" novalidate class="flex flex-col gap-4" @submit="save">
          <UFormField name="name" :label="direction === 'procurement' ? $t('pipeline.vendorName') : $t('pipeline.dealName')">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <div class="grid sm:grid-cols-2 gap-3">
            <UFormField name="email" :label="$t('customers.email')">
              <UInput v-model="form.email" inputmode="email" autocomplete="email" class="w-full" />
            </UFormField>
            <UFormField name="phone" :label="$t('customers.phone')">
              <UInput v-model="form.phone" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="$t('pipeline.customer')" :help="$t('pipeline.customerHelp')">
            <USelect v-model="form.customer_id" :items="customerItems" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.stage.label')">
            <USelect v-model="form.stage" :items="stageOptions" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.label')">
            <UInput v-model="form.label" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.value')">
            <UInput v-model.number="form.value" type="number" step="50" class="w-full" />
          </UFormField>
          <UFormField :label="$t('pipeline.due')">
            <UiDatePicker v-model="form.due_date" />
          </UFormField>
          <UFormField :label="$t('common.notes')">
            <UTextarea v-model="form.notes" :rows="3" autoresize class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <button class="ed-btn-ghost" type="button" @click="open = false">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" :disabled="saving" type="button" @click="formRef?.submit()">{{ $t('common.save') }}</button>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="deleteModal.open" :title="$t('pipeline.deleteTitle')">
      <template #body>
        <p class="page-pipeline__modal-text">
          {{ $t('pipeline.deleteText', { name: deleteModal.deal?.customer_name || deleteModal.deal?.name || '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" type="button" @click="deleteModal = { open: false, deal: null }">{{ $t('common.cancel') }}</button>
          <button class="ed-btn-primary" type="button" @click="performDelete">{{ $t('common.delete') }}</button>
        </div>
      </template>
    </UModal>

    <UModal v-if="direction === 'sales'" v-model:open="finalModal.open" :title="$t('pipeline.wonTitle')">
      <template #body>
        <p v-if="finalModal.deal?.customer_id" class="page-pipeline__modal-text">
          {{ $t('pipeline.wonText', { customer: finalModal.deal?.customer_name || finalModal.deal?.name || '' }) }}
        </p>
        <p v-else class="page-pipeline__modal-text">
          {{ $t('pipeline.wonNoCustomer', { name: finalModal.deal?.name || '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" type="button" @click="dismissFinalModal">{{ $t('pipeline.wonSkip') }}</button>
          <button v-if="finalModal.deal?.customer_id" class="ed-btn-primary" type="button" :disabled="completing" @click="completeFinal">
            <UIcon name="i-lucide-file-text" class="size-3.5" />
            {{ $t('pipeline.wonCreateInvoice') }}
          </button>
          <button v-else class="ed-btn-primary" type="button" @click="dismissFinalModal(); finalModal.deal && openEdit(finalModal.deal)">
            <UIcon name="i-lucide-pencil" class="size-3.5" />
            {{ $t('pipeline.wonLinkCustomer') }}
          </button>
        </div>
      </template>
    </UModal>

    <UModal v-else v-model:open="finalModal.open" :title="$t('pipeline.acceptedTitle')">
      <template #body>
        <p class="page-pipeline__modal-text">
          {{ $t('pipeline.acceptedText', {
            vendor: finalModal.deal?.customer_name || finalModal.deal?.name || '',
            amount: chf(finalModal.deal?.value_rappen ?? 0)
          }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <button class="ed-btn-ghost" type="button" @click="dismissFinalModal">{{ $t('pipeline.wonSkip') }}</button>
          <button class="ed-btn-primary" type="button" :disabled="completing || (finalModal.deal?.value_rappen ?? 0) <= 0" @click="completeFinal">
            <UIcon name="i-lucide-receipt" class="size-3.5" />
            {{ $t('pipeline.acceptedLog') }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>
