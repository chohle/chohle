<script setup lang="ts">
const props = defineProps<{ cols?: number }>()
const style = computed(() => props.cols ? { '--kpi-cols': String(props.cols) } : undefined)
</script>
<template>
  <div class="kpi-row" :style="style">
    <slot />
  </div>
</template>
