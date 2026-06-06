<script setup lang="ts">
// Renders the exact branded email (message body + chosen signature) the server
// will send, in a sandboxed iframe. Used by every send flow's "Vorschau" step.
const props = defineProps<{ bodyHtml: string; signatureId?: number | null }>()

const html = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    html.value = await $fetch<string>('/api/email/preview', {
      method: 'POST',
      body: { body_html: props.bodyHtml, signature_id: props.signatureId ?? undefined }
    })
  } finally {
    loading.value = false
  }
}
watch(() => [props.bodyHtml, props.signatureId], load)
onMounted(load)
</script>

<template>
  <div class="email-preview">
    <div v-if="loading" class="email-preview__loading">
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
    </div>
    <iframe :srcdoc="html" class="email-preview__frame" title="Email preview" sandbox="" />
  </div>
</template>
