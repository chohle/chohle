<script setup lang="ts">
const colorMode = useColorMode()
const appearanceItems = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
]
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="Settings" description="App preferences." />

    <UCard>
      <UFormField label="Appearance" help="Choose the colour theme.">
        <USelect v-model="colorMode.preference" :items="appearanceItems" class="w-40" />
      </UFormField>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">Your data</h2>
      </template>
      <p class="text-sm text-muted">
        Everything lives in the <code class="text-default">data/</code> folder: the SQLite
        database and your uploaded files. Back up that folder and you have backed up everything.
      </p>
    </UCard>
  </div>
</template>