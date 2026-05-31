<script setup lang="ts">
const route = useRoute()
</script>
<template>
  <ProjectDetailView direction="procurement" :id="String(route.params.id)" />
</template>
