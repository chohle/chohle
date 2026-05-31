<script setup lang="ts">
withDefaults(
  defineProps<{ icon?: string; title: string; description?: string; bordered?: boolean }>(),
  { bordered: true }
)
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state--bordered': bordered }">
    <div class="empty-state__ico">
      <UIcon :name="icon ?? 'i-lucide-inbox'" class="size-5" />
    </div>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>
