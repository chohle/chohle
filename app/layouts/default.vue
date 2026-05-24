<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()
const username = computed(() => user.value?.username ?? 'Owner')

async function onSignOut() {
  await clear()
  await navigateTo('/login')
}

const items: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Expenses', icon: 'i-lucide-receipt', to: '/expenses' },
  { label: 'Income', icon: 'i-lucide-banknote', to: '/income' },
  { label: 'Customers', icon: 'i-lucide-users', to: '/customers' },
  { label: 'Articles', icon: 'i-lucide-package', to: '/articles' },
  { label: 'Categories', icon: 'i-lucide-tags', to: '/categories' }
]

const userMenu: DropdownMenuItem[][] = [
  [
    { label: 'Profile', icon: 'i-lucide-user', to: '/profile' },
    { label: 'Billing', icon: 'i-lucide-credit-card', to: '/billing' },
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
  ],
  [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: onSignOut }]
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
      <UDropdownMenu :items="userMenu" :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }">
        <button
          class="w-full flex items-center gap-2 rounded-md p-2 text-left hover:bg-elevated"
        >
          <UAvatar :alt="username" size="2xs" />
          <span class="flex-1 truncate text-sm font-medium">{{ username }}</span>
          <UIcon name="i-lucide-chevrons-up-down" class="size-4 text-muted shrink-0" />
        </button>
      </UDropdownMenu>
    </aside>
    <main class="flex-1 p-6 overflow-auto">
      <slot />
    </main>
  </div>
</template>
