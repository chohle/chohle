<script setup lang="ts">
const route = useRoute()
</script>
<template>
  <DealDetailView direction="sales" :id="String(route.params.id)" />
</template>
