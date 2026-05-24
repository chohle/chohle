<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// Targets are wired up as each feature lands (see docs/idea/FEATURES.md).
const items: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Expenses', icon: 'i-lucide-receipt', to: '/expenses' },
  { label: 'Income', icon: 'i-lucide-banknote', to: '/income' },
  { label: 'Customers', icon: 'i-lucide-users', to: '/customers' },
  { label: 'Articles', icon: 'i-lucide-package', to: '/articles' },
  { label: 'Categories', icon: 'i-lucide-tags', to: '/categories' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
]
</script>

<template>
  <div class="min-h-screen flex bg-default text-default">
    <aside class="w-60 shrink-0 border-r border-default p-4 flex flex-col gap-6">
      <div class="flex items-center gap-2 px-2">
        <UIcon name="i-lucide-wallet" class="size-6 text-primary" />
        <span class="text-lg font-semibold">batze</span>
      </div>
      <UNavigationMenu orientation="vertical" :items="items" class="flex-1" />
    </aside>
    <main class="flex-1 p-6 overflow-auto">
      <slot />
    </main>
  </div>
</template>