<script setup lang="ts">
const props = defineProps<{
  crumb?: string
  title: string
  subtitle?: string
  // Override the browser tab title when it should differ from the visible
  // heading (e.g. the dashboard shows a greeting but the tab says "Dashboard").
  docTitle?: string
}>()

// Every page that shows a page header also gets the matching browser tab title.
useHead({ title: () => props.docTitle ?? props.title })
</script>
<template>
  <header class="page-head">
    <div class="page-head__text">
      <div v-if="crumb" class="page-head__crumb eyebrow">{{ crumb }}</div>
      <h1 class="page-head__title">
        <slot name="title">{{ title }}</slot>
      </h1>
      <!-- A div, not a p: subtitle slots can contain block content (chips,
           links, flex rows). A <div> inside a <p> is invalid HTML — the browser
           hoists it out, which breaks SSR hydration. -->
      <div v-if="subtitle || $slots.subtitle" class="page-head__sub">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
