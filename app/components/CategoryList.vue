<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: string
  color: string
  icon: string
}

defineProps<{ title: string, categories: Category[] }>()
defineEmits<{ remove: [id: number] }>()
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">{{ title }}</h2>
    </template>

    <p v-if="!categories.length" class="text-muted text-sm">Nothing here yet.</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="c in categories" :key="c.id" class="flex items-center gap-3 py-2">
        <UIcon :name="c.icon" :style="{ color: c.color }" class="size-5 shrink-0" />
        <span class="flex-1 truncate">{{ c.name }}</span>
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          @click="$emit('remove', c.id)"
        />
      </li>
    </ul>
  </UCard>
</template>