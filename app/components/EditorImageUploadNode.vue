<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()
const { t } = useI18n()
const toast = useToast()
const file = ref<File | null>(null)
const loading = ref(false)

// Upload the picked image to the server and insert it by hosted URL — never as
// a base64 data URI, which several email clients (Gmail) refuse to display.
watch(file, async (newFile) => {
  if (!newFile) return
  loading.value = true
  try {
    const body = new FormData()
    body.append('image', newFile)
    const { url } = await $fetch<{ url: string }>('/api/uploads/email-image', {
      method: 'POST',
      body
    })
    const pos = props.getPos()
    if (!url || typeof pos !== 'number') return
    // Replace this upload placeholder node with the actual image.
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .setImage({ src: url })
      .run()
  } catch {
    toast.add({ title: t('editor.uploadFailed'), color: 'error' })
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <NodeViewWrapper>
    <UFileUpload
      v-model="file"
      accept="image/*"
      :label="$t('editor.uploadImage')"
      :description="$t('editor.uploadHint')"
      :preview="false"
      class="min-h-40"
    >
      <template #leading>
        <UAvatar
          :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
          size="lg"
          :ui="{ icon: [loading && 'animate-spin'] }"
        />
      </template>
    </UFileUpload>
  </NodeViewWrapper>
</template>
