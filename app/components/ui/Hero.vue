<script setup lang="ts">
defineProps<{
  eyebrow?: string
  currency?: string
  value: string | number
  delta?: string
}>()
</script>

<template>
  <section class="hero">
    <div class="hero-main">
      <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
      <div class="hero-number tabular">
        <span v-if="currency" class="hero-cur">{{ currency }}</span>
        <span class="hero-num">{{ value }}</span>
        <span class="hero-period">.</span>
      </div>
    </div>
    <div v-if="$slots.aside || delta" class="hero-aside">
      <div v-if="delta" class="hero-delta mono">{{ delta }}</div>
      <slot name="aside" />
    </div>
  </section>
</template>
