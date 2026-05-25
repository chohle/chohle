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
  <UDashboardGroup>
    <UDashboardSidebar>
      <template #header>
        <NuxtLink to="/" class="flex items-center px-1 py-0.5">
          <img src="/logo.svg" alt="batze" class="h-6 w-auto dark:invert">
        </NuxtLink>
      </template>

      <UNavigationMenu orientation="vertical" :items="items" />

      <template #footer>
        <UDropdownMenu
          :items="userMenu"
          :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
          class="w-full"
        >
          <button
            class="w-full flex items-center gap-2 rounded-md p-2 text-left hover:bg-elevated"
          >
            <UAvatar :alt="username" size="2xs" />
            <span class="flex-1 truncate text-sm font-medium">{{ username }}</span>
            <UIcon name="i-lucide-chevrons-up-down" class="size-4 text-muted shrink-0" />
          </button>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar class="lg:hidden">
          <template #title>
            <img src="/logo.svg" alt="batze" class="h-5 w-auto dark:invert">
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <div class="mx-auto w-full max-w-6xl">
          <slot />
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>