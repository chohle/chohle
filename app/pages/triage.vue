<script setup lang="ts">
interface TriageRow {
  id: number
  message_id: string | null
  from_address: string | null
  to_address: string | null
  subject: string
  body_html: string
  body_text: string
  sent_at: string | null
  created_at: string
  suggested_customer_id: number | null
  suggested_project_id: number | null
  suggested_customer_name: string | null
  suggested_project_name: string | null
  suggested_project_direction: 'sales' | 'procurement' | null
}

interface ProjectLite {
  id: number
  name: string
  stage: string
  budget_rappen: number
}

const { t } = useI18n()
const toast = useToast()
const { count: triageCount, refresh: refreshCount } = useTriageCount()

const { data, refresh } = await useFetch<{ rows: TriageRow[]; count: number }>('/api/triage', {
  default: () => ({ rows: [], count: 0 })
})
useHead({ title: () => t('triage.title') })

// Keep the sidebar badge in lockstep with what the page is showing.
watchEffect(() => {
  triageCount.value = data.value.count
})

const busy = ref<number | null>(null)

function snippet(r: TriageRow): string {
  const raw = r.body_text || r.body_html.replace(/<[^>]+>/g, ' ')
  return raw.replace(/\s+/g, ' ').trim().slice(0, 180)
}
function fmt(s: string | null): string {
  if (!s) return ''
  const hm = s.slice(11, 16)
  return hm ? `${dateCh(s.slice(0, 10))} · ${hm}` : dateCh(s.slice(0, 10))
}

async function assignTo(r: TriageRow, projectId: number) {
  busy.value = r.id
  try {
    await $fetch(`/api/triage/${r.id}/assign`, { method: 'POST', body: { project_id: projectId } })
    toast.add({ title: t('triage.assigned'), color: 'success' })
    await refresh()
    await refreshCount()
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('triage.assignFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    busy.value = null
  }
}

async function dismiss(r: TriageRow) {
  busy.value = r.id
  try {
    await $fetch(`/api/triage/${r.id}/dismiss`, { method: 'POST' })
    await refresh()
    await refreshCount()
  } catch {
    toast.add({ title: t('triage.dismissFailed'), color: 'error' })
  } finally {
    busy.value = null
  }
}

// "Choose project…" lazy-loads the suggested customer's projects, then hands
// off to the shared ProjectPicker (which can also create a new project).
const pickerOpen = ref(false)
const pickerFor = ref<TriageRow | null>(null)
const pickerProjects = ref<ProjectLite[]>([])
const pickerLoading = ref(false)

async function openPicker(r: TriageRow) {
  if (!r.suggested_customer_id) return
  pickerFor.value = r
  pickerOpen.value = true
  pickerLoading.value = true
  try {
    pickerProjects.value = await $fetch<ProjectLite[]>(
      `/api/customers/${r.suggested_customer_id}/projects`
    )
  } catch {
    pickerProjects.value = []
  } finally {
    pickerLoading.value = false
  }
}

function onPicked(projectId: number) {
  const r = pickerFor.value
  pickerOpen.value = false
  if (r) assignTo(r, projectId)
}
</script>

<template>
  <div class="page-triage">
    <UiPageHead
      :crumb="`${$t('nav.workspace')} / ${$t('nav.triage')}`"
      :title="$t('triage.title')"
      :subtitle="$t('triage.subtitle')"
    />

    <EmptyState
      v-if="!data.rows.length"
      icon="i-lucide-inbox"
      :title="$t('triage.emptyTitle')"
      :description="$t('triage.emptyText')"
    />

    <ul v-else class="page-triage__list">
      <li v-for="r in data.rows" :key="r.id" class="triage-card">
        <div class="triage-card__head">
          <span class="triage-card__from mono">{{
            r.from_address || $t('triage.unknownSender')
          }}</span>
          <span class="triage-card__time mono">{{ fmt(r.sent_at) }}</span>
        </div>
        <h3 class="triage-card__subject">{{ r.subject || $t('conversations.noSubject') }}</h3>
        <p class="triage-card__snippet">{{ snippet(r) }}</p>

        <div class="triage-card__foot">
          <span v-if="r.suggested_project_id" class="triage-card__suggestion mono">
            <UIcon name="i-lucide-sparkles" class="size-3.5" />
            {{ r.suggested_customer_name }} · {{ r.suggested_project_name }}
          </span>
          <span v-else class="triage-card__suggestion triage-card__suggestion--none mono">
            {{
              r.suggested_customer_id
                ? $t('triage.noProjectSuggestion')
                : $t('triage.noCustomerMatch')
            }}
          </span>

          <div class="triage-card__actions">
            <button
              v-if="r.suggested_project_id"
              class="ed-btn-primary"
              type="button"
              :disabled="busy === r.id"
              @click="assignTo(r, r.suggested_project_id)"
            >
              <UIcon name="i-lucide-check" class="size-3.5" />
              {{ $t('triage.assignToSuggested') }}
            </button>
            <button
              v-if="r.suggested_customer_id"
              class="ed-btn"
              type="button"
              :disabled="busy === r.id"
              @click="openPicker(r)"
            >
              <UIcon name="i-lucide-folder-search" class="size-3.5" />
              {{ $t('triage.chooseProject') }}
            </button>
            <button
              class="ed-btn-ghost"
              type="button"
              :disabled="busy === r.id"
              @click="dismiss(r)"
            >
              {{ $t('triage.dismiss') }}
            </button>
          </div>
        </div>
      </li>
    </ul>

    <UModal v-model:open="pickerOpen" :title="$t('triage.chooseProject')">
      <template #body>
        <div v-if="pickerLoading" class="page-triage__picker-loading mono">
          {{ $t('triage.loading') }}
        </div>
        <ProjectPicker
          v-else-if="pickerFor?.suggested_customer_id"
          :customer-id="pickerFor.suggested_customer_id"
          :projects="pickerProjects"
          @resolved="onPicked"
          @cancel="pickerOpen = false"
        />
      </template>
    </UModal>
  </div>
</template>
