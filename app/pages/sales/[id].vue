<script setup lang="ts">
const route = useRoute()
</script>
<template>
  <ProjectDetailView direction="sales" :id="String(route.params.id)" />
</template>
