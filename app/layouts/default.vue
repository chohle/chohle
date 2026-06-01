<script setup lang="ts">
const paletteOpen = ref(false)
const { isOpen: mobileNavOpen, close: closeMobileNav } = useMobileNav()
const { isCollapsed } = useSidebarCollapse()

onMounted(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      paletteOpen.value = !paletteOpen.value
    }
    if (e.key === 'Escape' && mobileNavOpen.value) {
      closeMobileNav()
    }
  }
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-nav-collapsed': isCollapsed }">
    <AppSidebar />
    <div
      v-if="mobileNavOpen"
      class="app-shell__backdrop"
      aria-hidden="true"
      @click="closeMobileNav"
    />
    <main class="app-main">
      <AppTopbar @open-palette="paletteOpen = true" />
      <div class="app-content">
        <slot />
      </div>
    </main>
    <CommandPalette v-model:open="paletteOpen" />
  </div>
</template>
