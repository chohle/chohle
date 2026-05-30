<script setup lang="ts">
// `flush` drops the 24px inner padding so the card can host its own
// toolbar / table layouts that need to run edge-to-edge.
defineProps<{ flush?: boolean }>()
</script>

<template>
  <div class="ed-card" :class="{ 'ed-card--flush': flush }"><slot /></div>
</template>
