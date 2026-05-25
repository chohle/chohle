<script setup lang="ts">
withDefaults(
  defineProps<{ icon?: string, title: string, description?: string, bordered?: boolean }>(),
  { bordered: true }
)
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center px-6"
    :class="bordered
      ? 'rounded-xl border border-dashed border-default py-16 min-h-[60vh]'
      : 'py-12'"
  >
    <div class="size-14 rounded-2xl bg-elevated flex items-center justify-center mb-4">
      <UIcon :name="icon ?? 'i-lucide-inbox'" class="size-7 text-muted" />
    </div>
    <p class="text-base font-semibold text-highlighted">{{ title }}</p>
    <p v-if="description" class="text-sm text-muted mt-1.5 max-w-sm">{{ description }}</p>
    <div v-if="$slots.action" class="mt-5">
      <slot name="action" />
    </div>
  </div>
</template>
