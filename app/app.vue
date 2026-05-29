<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()
const locale_ = computed(() => uiLocales[locale.value as keyof typeof uiLocales])

// Initialise tweaks (theme + radius) and apply to <html> on mount.
useTweaks()
// Restore sidebar collapse preference (icon-only mode on desktop).
useSidebarCollapse()
</script>

<template>
  <UApp :locale="locale_">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>