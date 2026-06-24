<script setup lang="ts">
// Inline failure state for a `useFetch` call, so a backend/network error is not
// silently shown as an empty result. Mirrors EmptyState's look and adds a retry
// affordance; pages wire it as `<FetchError v-if="error" @retry="refresh()" />`.
withDefaults(defineProps<{ bordered?: boolean }>(), { bordered: true })
defineEmits<{ retry: [] }>()
</script>

<template>
  <!-- role="alert" (implies aria-live="assertive") so screen readers announce the
       failure and retry action; it falls through to EmptyState's single root element. -->
  <EmptyState
    role="alert"
    icon="i-lucide-triangle-alert"
    :title="$t('common.loadErrorTitle')"
    :description="$t('common.loadErrorText')"
    :bordered="bordered"
  >
    <template #action>
      <UButton color="neutral" variant="subtle" icon="i-lucide-rotate-cw" @click="$emit('retry')">
        {{ $t('common.retry') }}
      </UButton>
    </template>
  </EmptyState>
</template>
