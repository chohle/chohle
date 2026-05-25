<script setup lang="ts">
import * as uiLocales from '@nuxt/ui/locale'

const { locale } = useI18n()
const locale_ = computed(() => uiLocales[locale.value as keyof typeof uiLocales])
</script>

<template>
  <UApp :locale="locale_">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>