<script setup lang="ts">
const props = defineProps<{ src: string | null, uploadUrl: string, removeUrl: string }>()
const emit = defineEmits<{ changed: [] }>()

const input = ref<HTMLInputElement>()
const busy = ref(false)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const body = new FormData()
  body.append('logo', file)
  busy.value = true
  try {
    await $fetch(props.uploadUrl, { method: 'POST', body })
    emit('changed')
  } finally {
    busy.value = false
    if (input.value) input.value.value = ''
  }
}

async function remove() {
  busy.value = true
  try {
    await $fetch(props.removeUrl, { method: 'DELETE' })
    emit('changed')
  } finally { busy.value = false }
}
</script>

<template>
  <div class="logo-upload">
    <div class="logo-upload__frame">
      <img v-if="src" :src="src" alt="Logo" class="logo-upload__img">
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
      <input ref="input" type="file" accept="image/*" class="logo-upload__file" @change="onFile">
    </div>
  </div>
</template>
