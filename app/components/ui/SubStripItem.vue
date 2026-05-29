<script setup lang="ts">
defineProps<{ label: string; currency?: string; value: string | number; delta?: string }>()
</script>
<template>
  <div class="sub-strip-item">
    <div class="sub-strip-item__row">
      <span class="sub-strip-item__dash" aria-hidden="true" />
      <span class="sub-strip-item__label eyebrow">{{ label }}</span>
    </div>
    <div class="sub-strip-item__value tabular">
      <span v-if="currency" class="sub-strip-item__cur">{{ currency }}</span>
      {{ value }}
    </div>
    <div v-if="delta" class="sub-strip-item__delta mono">{{ delta }}</div>
  </div>
</template>
