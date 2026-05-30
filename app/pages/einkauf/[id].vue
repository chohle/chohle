<script setup lang="ts">
const route = useRoute()
</script>
<template>
  <DealDetailView direction="procurement" :id="String(route.params.id)" />
</template>
