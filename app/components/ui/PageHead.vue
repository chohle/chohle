<script setup lang="ts">
defineProps<{ crumb?: string; title: string; subtitle?: string }>()
</script>
<template>
  <header class="page-head">
    <div class="page-head__text">
      <div v-if="crumb" class="page-head__crumb eyebrow">{{ crumb }}</div>
      <h1 class="page-head__title">
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="subtitle || $slots.subtitle" class="page-head__sub">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
