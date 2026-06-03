<script setup lang="ts">
const props = defineProps<{
  src: string | null
  uploadUrl: string
  removeUrl: string
  // MIME filter for the picker + client-side guard. Defaults to any image;
  // pass e.g. "image/png" to restrict (the company logo is PNG-only).
  accept?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const toast = useToast()
const input = ref<HTMLInputElement>()
const busy = ref(false)

const acceptAttr = computed(() => props.accept ?? 'image/*')

// True when `type` satisfies the accept filter (handles wildcards like image/*).
function accepts(type: string): boolean {
  return acceptAttr.value
    .split(',')
    .map((a) => a.trim())
    .some((a) => a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))))
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  // The accept attribute only filters the OS picker; a user can still pick
  // "all files", so re-check here before uploading.
  if (!accepts(file.type)) {
    toast.add({ title: t('logoUpload.invalidType'), color: 'error' })
    return
  }
  const body = new FormData()
  body.append('logo', file)
  busy.value = true
  try {
    await $fetch(props.uploadUrl, { method: 'POST', body })
    emit('changed')
  } catch {
    toast.add({ title: t('logoUpload.uploadFailed'), color: 'error' })
  } finally {
    busy.value = false
  }
}

const confirm = useConfirm()
async function remove() {
  if (!(await confirm())) return
  busy.value = true
  try {
    await $fetch(props.removeUrl, { method: 'DELETE' })
    emit('changed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="logo-upload">
    <div class="logo-upload__frame">
      <img v-if="src" :src="src" alt="Logo" class="logo-upload__img" />
      <UIcon v-else name="i-lucide-image" class="logo-upload__empty" />
    </div>
    <div class="logo-upload__actions">
      <button class="ed-btn ed-btn-sm" :disabled="busy" @click="input?.click()">
        <UIcon name="i-lucide-upload" class="size-3" />
        {{ src ? $t('logoUpload.replace') : $t('logoUpload.upload') }}
      </button>
      <button v-if="src" class="ed-btn-ghost ed-btn-sm" :disabled="busy" @click="remove">
        <UIcon name="i-lucide-trash-2" class="size-3" />
        {{ $t('logoUpload.remove') }}
      </button>
      <input
        ref="input"
        type="file"
        :accept="acceptAttr"
        class="logo-upload__file"
        @change="onFile"
      />
    </div>
  </div>
</template>
