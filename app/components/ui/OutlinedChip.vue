<script setup lang="ts">
defineProps<{ status?: 'paid' | 'sent' | 'draft' | 'overdue' | 'due' }>()
</script>
<template>
  <span class="o-chip mono" :class="status ? `o-chip--${status}` : ''">
    <slot />
  </span>
</template>
