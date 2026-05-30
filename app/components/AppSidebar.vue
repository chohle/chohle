<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const { user, clear } = useUserSession()
const username = computed(() => user.value?.username ?? 'Owner')
const userEmail = computed(() => (user.value as { email?: string } | null)?.email ?? '')

const { isOpen: mobileOpen, close: closeMobile } = useMobileNav()
const { isCollapsed } = useSidebarCollapse()
const router = useRouter()

async function onSignOut() {
  await clear()
  await navigateTo('/login')
}

// A `Group` is a parent that holds children but isn't itself a route; it
// renders as a collapsible header in the sidebar. A regular `Item` is a
// link (with no children). `to` is required on items, omitted on groups.
interface Item { label: string; icon: string; to: string; count?: number | string }
interface Group { label: string; icon: string; children: Item[] }
type Entry = Item | Group
interface Section { label: string; items: Entry[] }

function isGroup(e: Entry): e is Group {
  return 'children' in e
}

const sections = computed<Section[]>(() => [
  {
    label: 'Workspace',
    items: [
      { label: t('nav.dashboard'), icon: 'i-lucide-layout-dashboard', to: '/' },
      { label: t('nav.customers'), icon: 'i-lucide-users', to: '/customers' },
      { label: t('nav.invoices'), icon: 'i-lucide-file-text', to: '/invoices' },
      { label: t('nav.articles'), icon: 'i-lucide-package', to: '/articles' },
      { label: t('nav.activity'), icon: 'i-lucide-activity', to: '/activity' },
      {
        label: t('nav.pipeline'),
        icon: 'i-lucide-kanban',
        children: [
          { label: t('nav.vertrieb'), icon: 'i-lucide-trending-up', to: '/vertrieb' },
          { label: t('nav.einkauf'), icon: 'i-lucide-shopping-cart', to: '/einkauf' }
        ]
      }
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

function groupContainsRoute(g: Group) {
  return g.children.some(c => isActive(c.to))
}

// Per-group expanded state. Defaults to expanded if the current route lives
// inside it, but the user can toggle freely from there. Map key = group label.
const expanded = reactive<Record<string, boolean>>({})
function isExpanded(g: Group) {
  return expanded[g.label] ?? groupContainsRoute(g)
}
function toggleGroup(g: Group) {
  expanded[g.label] = !isExpanded(g)
}

// When the sidebar is collapsed we expose the group's children through a
// dropdown menu so they remain reachable by click / keyboard instead of
// being orphaned behind a label-only tooltip.
function groupMenu(g: Group): DropdownMenuItem[][] {
  return [g.children.map(c => ({
    label: c.label,
    icon: c.icon,
    onSelect: () => { router.push(c.to) }
  }))]
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
        <template v-for="i in s.items" :key="(i as Group).label || (i as Item).to">
          <!-- Group (collapsible parent) -->
          <template v-if="isGroup(i)">
            <!-- Collapsed sidebar: render the group as a dropdown menu so the
                 children stay clickable and keyboard-reachable. -->
            <UDropdownMenu
              v-if="isCollapsed"
              :items="groupMenu(i)"
              :content="{ side: 'right', sideOffset: 12 }"
            >
              <UTooltip
                :text="i.label"
                :delay-duration="0"
                :content="{ side: 'right', sideOffset: 12 }"
              >
                <button
                  type="button"
                  class="nav-item nav-group-trigger"
                  :class="{ active: groupContainsRoute(i) }"
                  :aria-label="i.label"
                >
                  <UIcon :name="i.icon" class="nav-icon" />
                </button>
              </UTooltip>
            </UDropdownMenu>
            <template v-else>
              <button
                type="button"
                class="nav-item nav-group-trigger"
                :class="{ active: groupContainsRoute(i), 'is-expanded': isExpanded(i) }"
                :aria-expanded="isExpanded(i)"
                @click="toggleGroup(i)"
              >
                <UIcon :name="i.icon" class="nav-icon" />
                <span class="nav-text">{{ i.label }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="nav-chevron"
                  :class="{ open: isExpanded(i) }"
                />
              </button>
              <ul v-if="isExpanded(i)" class="nav-children">
                <li v-for="c in i.children" :key="c.to">
                  <NuxtLink :to="c.to" class="nav-item nav-child" :class="{ active: isActive(c.to) }">
                    <UIcon :name="c.icon" class="nav-icon" />
                    <span class="nav-text">{{ c.label }}</span>
                  </NuxtLink>
                </li>
              </ul>
            </template>
          </template>

          <!-- Regular item -->
          <UTooltip
            v-else
            :text="i.label"
            :delay-duration="0"
            :disabled="!isCollapsed"
            :content="{ side: 'right', sideOffset: 12 }"
          >
            <NuxtLink :to="i.to" class="nav-item" :class="{ active: isActive(i.to) }">
              <UIcon :name="i.icon" class="nav-icon" />
              <span class="nav-text">{{ i.label }}</span>
              <span v-if="i.count != null" class="nav-count mono">{{ i.count }}</span>
            </NuxtLink>
          </UTooltip>
        </template>
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
