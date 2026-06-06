<script setup lang="ts">
// A thin bar shown only when the app runs as a public demo (public.demo). It
// reassures the visitor their sandbox is private and offers a one-click reset.
const config = useRuntimeConfig()
const isDemo = computed(() => !!config.public.demo)

const resetting = ref(false)
async function resetDemo() {
  resetting.value = true
  try {
    await $fetch('/api/demo/reset', { method: 'POST' })
    if (import.meta.client) window.location.reload()
  } catch {
    resetting.value = false
  }
}
</script>

<template>
  <div v-if="isDemo" class="demo-banner">
    <UIcon name="i-lucide-flask-conical" class="demo-banner__icon" />
    <span class="demo-banner__text">{{ $t('demo.notice') }}</span>
    <button class="demo-banner__reset" :disabled="resetting" @click="resetDemo">
      <UIcon name="i-lucide-rotate-ccw" class="size-3.5" :class="{ 'demo-spin': resetting }" />
      {{ $t('demo.reset') }}
    </button>
  </div>
</template>
