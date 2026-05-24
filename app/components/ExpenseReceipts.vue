<script setup lang="ts">
interface Attachment {
  id: number
  filename: string
}

const props = defineProps<{ expenseId: number, attachments: Attachment[] }>()
const emit = defineEmits<{ changed: [] }>()

const input = ref<HTMLInputElement>()
const uploading = ref(false)

async function onFiles(event: Event) {
  const files = (event.target as HTMLInputElement).files
  if (!files?.length) return

  const body = new FormData()
  for (const file of files) body.append('files', file)

  uploading.value = true
  try {
    await $fetch(`/api/expenses/${props.expenseId}/attachments`, { method: 'POST', body })
    emit('changed')
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

async function remove(id: number) {
  await $fetch(`/api/attachments/${id}`, { method: 'DELETE' })
  emit('changed')
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <span
      v-for="a in attachments"
      :key="a.id"
      class="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-xs"
    >
      <a
        :href="`/api/attachments/${a.id}`"
        target="_blank"
        class="inline-flex items-center gap-1 hover:underline"
      >
        <UIcon name="i-lucide-paperclip" class="size-3" />
        <span class="max-w-28 truncate">{{ a.filename }}</span>
      </a>
      <button type="button" class="text-muted hover:text-error" @click="remove(a.id)">
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </span>

    <UButton
      size="xs"
      variant="ghost"
      color="neutral"
      icon="i-lucide-upload"
      :loading="uploading"
      @click="input?.click()"
    >
      Receipt
    </UButton>
    <input
      ref="input"
      type="file"
      multiple
      accept="application/pdf,image/*"
      class="hidden"
      @change="onFiles"
    >
  </div>
</template>
