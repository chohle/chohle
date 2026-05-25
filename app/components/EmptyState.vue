<script setup lang="ts">
defineProps<{ icon?: string, title: string, description?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-12 px-4">
    <div class="size-12 rounded-full bg-elevated flex items-center justify-center mb-3">
      <UIcon :name="icon ?? 'i-lucide-inbox'" class="size-6 text-muted" />
    </div>
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="text-sm text-muted mt-1 max-w-xs">{{ description }}</p>
    <div v-if="$slots.action" class="mt-4">
      <slot name="action" />
    </div>
  </div>
</template>
