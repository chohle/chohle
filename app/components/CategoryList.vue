<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: string
  color: string
  icon: string
}

defineProps<{ title: string, categories: Category[] }>()
defineEmits<{ edit: [Category], remove: [number] }>()
</script>

<template>
  <div>
    <h2 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{{ title }}</h2>

    <p v-if="!categories.length" class="text-muted text-sm">{{ $t('categories.nothingHere') }}</p>
    <div v-else class="space-y-2">
      <div
        v-for="c in categories"
        :key="c.id"
        class="flex items-center gap-3 rounded-lg border border-default p-3 hover:bg-elevated transition"
      >
        <span
          class="size-9 rounded-full flex items-center justify-center shrink-0"
          :style="{ backgroundColor: c.color + '20', color: c.color }"
        >
          <UIcon :name="c.icon" class="size-5" />
        </span>
        <span class="flex-1 truncate font-medium">{{ c.name }}</span>
        <div class="flex gap-1">
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="$emit('edit', c)"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            @click="$emit('remove', c.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
