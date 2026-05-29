<script setup lang="ts">
defineProps<{
  label: string
  currency?: string
  value: string | number
  delta?: string
  inverted?: boolean
}>()
</script>
<template>
  <div class="kpi-cell" :class="{ 'kpi-cell--inverted': inverted }">
    <div class="kpi-cell__row">
      <div class="kpi-cell__dot" />
      <div class="kpi-cell__label eyebrow">{{ label }}</div>
    </div>
    <div class="kpi-cell__value tabular">
      <span v-if="currency" class="kpi-cell__cur">{{ currency }}</span>
      {{ value }}
    </div>
    <div v-if="delta" class="kpi-cell__delta mono">{{ delta }}</div>
  </div>
</template>
