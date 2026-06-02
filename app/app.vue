<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()
const locale_ = computed(() => uiLocales[locale.value as keyof typeof uiLocales])

// Initialise tweaks (theme + radius) and apply to <html> on mount.
useTweaks()

// Browser tab title: "chohle | <page>" when a page sets a title, else just
// "chohle" (also for the bare default title from nuxt.config).
useHead({
  titleTemplate: (title) => (!title || title === 'chohle' ? 'chohle' : `chohle | ${title}`)
})
</script>

<template>
  <UApp :locale="locale_">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
