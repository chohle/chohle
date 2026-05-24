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
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-4">
    <div
      class="size-20 rounded border border-default bg-elevated flex items-center justify-center overflow-hidden shrink-0"
    >
      <img v-if="src" :src="src" alt="Logo" class="max-h-full max-w-full object-contain">
      <UIcon v-else name="i-lucide-image" class="size-6 text-muted" />
    </div>
    <div class="flex flex-col gap-2">
      <UButton
        size="sm"
        variant="soft"
        icon="i-lucide-upload"
        :loading="busy"
        @click="input?.click()"
      >
        {{ src ? 'Replace logo' : 'Upload logo' }}
      </UButton>
      <UButton
        v-if="src"
        size="sm"
        variant="ghost"
        color="error"
        icon="i-lucide-trash-2"
        @click="remove"
      >
        Remove
      </UButton>
      <input ref="input" type="file" accept="image/*" class="hidden" @change="onFile">
    </div>
  </div>
</template>