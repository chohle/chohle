<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()
const file = ref<File | null>(null)
const loading = ref(false)

watch(file, (newFile) => {
  if (!newFile) return
  loading.value = true
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    const pos = props.getPos()
    if (!dataUrl || typeof pos !== 'number') {
      loading.value = false
      return
    }
    // Replace this upload placeholder node with the actual image.
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .setImage({ src: dataUrl })
      .run()
    loading.value = false
  }
  reader.readAsDataURL(newFile)
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
