<script setup lang="ts">
const { t } = useI18n()
const emit = defineEmits<{ (e: 'open-palette'): void }>()
const { toggle: toggleMobileNav } = useMobileNav()
const { isCollapsed, toggle: toggleCollapse } = useSidebarCollapse()

const now = new Date()
const monoDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

function openPalette() { emit('open-palette') }

// Single panel button: on mobile it opens the drawer, on desktop it
// toggles the icon-only collapse. Matches the Nuxt UI sidebar pattern.
function onPanelClick() {
  if (typeof window === 'undefined') return
  if (window.matchMedia('(max-width: 900px)').matches) {
    toggleMobileNav()
  } else {
    toggleCollapse()
  }
}

const panelLabel = computed(() => isCollapsed.value ? t('sidebar.expand') : t('sidebar.collapse'))
</script>

<template>
  <header class="topbar">
    <button
      class="topbar__panel"
      type="button"
      :aria-label="panelLabel"
      @click="onPanelClick"
    >
      <UIcon name="i-lucide-panel-left" class="topbar__panel-icon" />
    </button>
    <button class="search" @click="openPalette">
      <UIcon name="i-lucide-search" class="search-icon" />
      <span class="search-text">{{ t('search.placeholder') }}</span>
      <kbd class="search-kbd mono">⌘K</kbd>
    </button>
    <div class="topbar-right">
      <span class="date mono">{{ monoDate }}</span>
    </div>
  </header>
</template>
