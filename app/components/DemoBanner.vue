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

<style scoped>
.demo-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 1rem;
  background: color-mix(in oklab, var(--accent, #6366f1) 12%, transparent);
  color: var(--accent, #4f46e5);
  border-bottom: 1px solid color-mix(in oklab, var(--accent, #6366f1) 25%, transparent);
  font-size: 0.8rem;
}
.demo-banner__icon {
  width: 1rem;
  height: 1rem;
  flex: none;
}
.demo-banner__text {
  flex: 1;
  min-width: 0;
}
.demo-banner__reset {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-weight: 500;
  white-space: nowrap;
}
.demo-banner__reset:disabled {
  opacity: 0.6;
}
.demo-spin {
  animation: demo-spin 0.8s linear infinite;
}
@keyframes demo-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
