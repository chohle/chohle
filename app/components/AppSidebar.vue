<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const route = useRoute()
const { user, clear } = useUserSession()
const username = computed(() => user.value?.username ?? 'Owner')
const userEmail = computed(() => (user.value as { email?: string } | null)?.email ?? '')

const { isOpen: mobileOpen, close: closeMobile } = useMobileNav()
const { isCollapsed } = useSidebarCollapse()

async function onSignOut() {
  await clear()
  await navigateTo('/login')
}

interface Item { label: string; icon: string; to: string; count?: number | string }
interface Section { label: string; items: Item[] }

const sections = computed<Section[]>(() => [
  {
    label: 'Workspace',
    items: [
      { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', to: '/' },
      { label: t('nav.customers'), icon: 'i-lucide-users', to: '/customers' },
      { label: t('nav.invoices'), icon: 'i-lucide-file-text', to: '/invoices' },
      { label: t('nav.articles'), icon: 'i-lucide-package', to: '/articles' }
    ]
  },
  {
    label: 'Finance',
    items: [
      { label: t('nav.income'), icon: 'i-lucide-banknote', to: '/income' },
      { label: t('nav.expenses'), icon: 'i-lucide-receipt', to: '/expenses' },
      { label: t('nav.payments'), icon: 'i-lucide-wallet', to: '/payments' },
      { label: t('nav.categories'), icon: 'i-lucide-tags', to: '/categories' }
    ]
  }
])

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(to + '/')
}

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: t('user.profile'), icon: 'i-lucide-user', to: '/profile' },
    { label: t('user.billing'), icon: 'i-lucide-credit-card', to: '/billing' },
    { label: t('user.settings'), icon: 'i-lucide-settings', to: '/settings' }
  ],
  [{ label: t('user.logout'), icon: 'i-lucide-log-out', onSelect: onSignOut }]
])
</script>

<template>
  <aside class="app-sidebar" :class="{ 'is-open': mobileOpen, 'is-collapsed': isCollapsed }">
    <div class="brand">
      <NuxtLink to="/" class="brand-link" aria-label="batze">
        <img v-if="!isCollapsed" src="/logo.svg" alt="batze" class="brand-logo">
        <span v-else class="brand-mark" aria-hidden="true">b</span>
      </NuxtLink>
      <button
        class="app-sidebar__close"
        type="button"
        :aria-label="$t('common.close')"
        @click="closeMobile"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>

    <nav class="nav">
      <div v-for="s in sections" :key="s.label" class="nav-section">
        <div class="nav-label eyebrow">— {{ s.label }}</div>
        <UTooltip
          v-for="i in s.items"
          :key="i.to"
          :text="i.label"
          :delay-duration="0"
          :disabled="!isCollapsed"
          :content="{ side: 'right', sideOffset: 12 }"
        >
          <NuxtLink
            :to="i.to"
            class="nav-item"
            :class="{ active: isActive(i.to) }"
          >
            <UIcon :name="i.icon" class="nav-icon" />
            <span class="nav-text">{{ i.label }}</span>
            <span v-if="i.count != null" class="nav-count mono">{{ i.count }}</span>
          </NuxtLink>
        </UTooltip>
      </div>
    </nav>

    <div class="user">
      <UDropdownMenu :items="userMenu" :ui="{ content: 'w-56' }">
        <UTooltip :text="username" :delay-duration="0" :disabled="!isCollapsed" :content="{ side: 'right', sideOffset: 12 }">
          <button class="user-btn" :aria-label="username">
            <UAvatar :alt="username" size="2xs" />
            <span class="user-meta">
              <span class="user-name">{{ username }}</span>
              <span v-if="userEmail" class="user-email mono">{{ userEmail }}</span>
            </span>
            <UIcon name="i-lucide-chevrons-up-down" class="user-icon" />
          </button>
        </UTooltip>
      </UDropdownMenu>
    </div>
  </aside>
</template>
