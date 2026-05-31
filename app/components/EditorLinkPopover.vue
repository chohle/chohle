<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{ editor: Editor }>()
const open = ref(false)
const url = ref('')

function onOpen() {
  url.value = (props.editor.getAttributes('link').href as string) ?? ''
  open.value = true
}
function apply() {
  const chain = props.editor.chain().focus().extendMarkRange('link')
  if (url.value.trim()) chain.setLink({ href: url.value.trim() }).run()
  else chain.unsetLink().run()
  open.value = false
}
function remove() {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      icon="i-lucide-link"
      color="neutral"
      variant="ghost"
      size="sm"
      :active="editor.isActive('link')"
      active-variant="soft"
      @click="onOpen"
    />
    <template #content>
      <div class="flex items-center gap-1 p-1">
        <UInput
          v-model="url"
          placeholder="https://..."
          size="sm"
          autofocus
          class="w-56"
          @keydown.enter="apply"
        />
        <UButton size="sm" icon="i-lucide-check" @click="apply" />
        <UButton
          v-if="editor.isActive('link')"
          size="sm"
          color="error"
          variant="ghost"
          icon="i-lucide-unlink"
          @click="remove"
        />
      </div>
    </template>
  </UPopover>
</template>
