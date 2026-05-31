<script setup lang="ts">
// Picks an existing project for the given customer or creates a new one
// (name + budget). Emits `resolved` with the chosen project id so the
// parent can do whatever comes next (typically: create an invoice scoped
// to that project).

interface ProjectLite {
  id: number
  name: string
  stage: string
  budget_rappen: number
}

const props = defineProps<{
  customerId: number
  projects: ProjectLite[]
}>()

const emit = defineEmits<{
  (e: 'resolved', projectId: number): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()
const toast = useToast()

const query = ref('')
const mode = ref<'pick' | 'create'>('pick')
const submitting = ref(false)

const newProject = reactive({
  name: '',
  budget: undefined as number | undefined,
  budget_type: 'fixed' as 'fixed' | 'hourly' | 'estimate'
})

const filtered = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  if (!term) return props.projects.slice(0, 8)
  return props.projects
    .filter(p => p.name.toLocaleLowerCase().includes(term))
    .slice(0, 8)
})

const createLabel = computed(() => {
  const name = query.value.trim()
  return name
    ? t('pipeline.picker.createNamedProject', { name })
    : t('pipeline.picker.createNewProject')
})

const budgetTypeItems = computed(() => [
  { value: 'fixed',    label: t('pipeline.budgetTypeFixed') },
  { value: 'hourly',   label: t('pipeline.budgetTypeHourly') },
  { value: 'estimate', label: t('pipeline.budgetTypeEstimate') }
])

function startCreate() {
  newProject.name = query.value.trim()
  newProject.budget = undefined
  newProject.budget_type = 'fixed'
  mode.value = 'create'
}

function backToPick() {
  mode.value = 'pick'
}

function pickExisting(p: ProjectLite) {
  emit('resolved', p.id)
}

function chf(rappen: number) {
  return (rappen / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

async function submitCreate() {
  if (!newProject.name.trim()) return
  submitting.value = true
  try {
    const body = {
      name: newProject.name.trim(),
      customer_id: props.customerId,
      direction: 'sales',
      stage: 'active',
      budget: newProject.budget ?? 0,
      budget_type: newProject.budget_type
    }
    const { id } = await $fetch<{ id: number }>('/api/projects', { method: 'POST', body })
    emit('resolved', id)
  } catch (err) {
    const msg = (err as { statusMessage?: string }).statusMessage ?? t('pipeline.picker.createFailed')
    toast.add({ title: msg, color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="project-picker">
    <template v-if="mode === 'pick'">
      <label class="project-picker__search">
        <UIcon name="i-lucide-search" class="size-4 project-picker__search-icon" />
        <input
          v-model="query"
          type="text"
          :placeholder="$t('pipeline.picker.searchProjectPlaceholder')"
          autocomplete="off"
        >
      </label>

      <ul class="project-picker__list">
        <li v-for="p in filtered" :key="p.id">
          <button
            type="button"
            class="project-picker__item"
            @click="pickExisting(p)"
          >
            <UIcon name="i-lucide-kanban" class="size-4 project-picker__item-icon" />
            <span class="project-picker__item-name">{{ p.name }}</span>
            <span class="project-picker__item-meta mono">
              {{ $t(`pipeline.stage.${p.stage}`) }} · CHF {{ chf(p.budget_rappen) }}
            </span>
          </button>
        </li>
        <li class="project-picker__create-row">
          <button
            type="button"
            class="project-picker__item project-picker__item--create"
            @click="startCreate"
          >
            <UIcon name="i-lucide-plus" class="size-4" />
            <span>{{ createLabel }}</span>
          </button>
        </li>
      </ul>
    </template>

    <form v-else class="project-picker__form" @submit.prevent="submitCreate">
      <button
        type="button"
        class="project-picker__back"
        @click="backToPick"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5" />
        {{ $t('common.back') }}
      </button>

      <UFormField :label="$t('pipeline.projectName')">
        <UInput v-model="newProject.name" autofocus required class="w-full" />
      </UFormField>

      <div class="grid sm:grid-cols-2 gap-3">
        <UFormField :label="$t('pipeline.budget')">
          <UInput v-model.number="newProject.budget" type="number" step="50" class="w-full" />
        </UFormField>
        <UFormField :label="$t('pipeline.budgetType')">
          <USelect v-model="newProject.budget_type" :items="budgetTypeItems" class="w-full" />
        </UFormField>
      </div>

      <div class="project-picker__actions">
        <button type="button" class="ed-btn-ghost" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
        <button type="submit" class="ed-btn-primary" :disabled="submitting || !newProject.name.trim()">
          <UIcon name="i-lucide-plus" class="size-3.5" />
          {{ $t('pipeline.picker.createProjectAndInvoice') }}
        </button>
      </div>
    </form>
  </div>
</template>
