<script setup lang="ts">
defineProps<{ title?: string, description?: string, backTo?: string, backLabel?: string }>()
</script>

<template>
  <div class="mb-6">
    <NuxtLink
      v-if="backTo"
      :to="backTo"
      class="inline-flex items-center gap-1 text-sm text-muted hover:text-default transition mb-3"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      {{ backLabel ?? 'Back' }}
    </NuxtLink>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <slot name="leading" />
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight text-highlighted truncate">
            <slot name="title">{{ title }}</slot>
          </h1>
          <p v-if="description || $slots.description" class="text-muted mt-1">
            <slot name="description">{{ description }}</slot>
          </p>
        </div>
      </div>

      <div v-if="$slots.actions" class="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
