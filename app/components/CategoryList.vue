<script setup lang="ts">
interface Category {
  id: number
  name: string
  type: 'expense' | 'income'
  color: string
  icon: string
}

defineProps<{ title: string; categories: Category[] }>()
defineEmits<{ edit: [Category]; remove: [number] }>()
</script>

<template>
  <div class="cat-list">
    <h2 class="eyebrow cat-list__title">{{ title }}</h2>

    <p v-if="!categories.length" class="cat-list__empty">{{ $t('categories.nothingHere') }}</p>
    <ul v-else class="cat-list__items">
      <li v-for="c in categories" :key="c.id" class="cat-list__row">
        <span class="cat-list__ico">
          <UIcon :name="c.icon" class="size-4" />
        </span>
        <span class="cat-list__name">{{ c.name }}</span>
        <div class="cat-list__actions">
          <button class="icon-btn" @click="$emit('edit', c)">
            <UIcon name="i-lucide-pencil" />
          </button>
          <button class="icon-btn" @click="$emit('remove', c.id)">
            <UIcon name="i-lucide-trash-2" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
