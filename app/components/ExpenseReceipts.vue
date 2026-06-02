<script setup lang="ts">
interface Attachment {
  id: number
  filename: string
}

const props = defineProps<{ expenseId: number; attachments: Attachment[] }>()
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

const confirm = useConfirm()
async function remove(id: number) {
  if (!(await confirm())) return
  await $fetch(`/api/attachments/${id}`, { method: 'DELETE' })
  emit('changed')
}
</script>

<template>
  <div class="rec">
    <span v-for="a in attachments" :key="a.id" class="rec__chip mono">
      <a :href="`/api/attachments/${a.id}`" target="_blank" class="rec__link">
        <UIcon name="i-lucide-paperclip" class="size-3" />
        <span class="rec__fname">{{ a.filename }}</span>
      </a>
      <button type="button" class="rec__rm" @click="remove(a.id)">
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </span>

    <button class="rec__up" :disabled="uploading" @click="input?.click()">
      <UIcon name="i-lucide-upload" class="size-3" />
      <span>{{ $t('expenses.receipt') }}</span>
    </button>
    <input
      ref="input"
      type="file"
      multiple
      accept="application/pdf,image/*"
      class="rec__file"
      @change="onFiles"
    />
  </div>
</template>
