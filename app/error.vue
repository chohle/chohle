<script setup lang="ts">
import type { NuxtError } from '#app'
import * as uiLocales from '@nuxt/ui/locale'

const { error } = defineProps<{ error: NuxtError }>()

const { t, locale } = useI18n()
const uiLocale = computed(() => uiLocales[locale.value as keyof typeof uiLocales])

const isNotFound = computed(() => error.statusCode === 404)
const statusCode = computed(() => error.statusCode || 500)

function handleReturn() {
  clearError({ redirect: '/' })
}

function handleReload() {
  clearError({ redirect: window.location.pathname })
}
</script>

<template>
  <UApp :locale="uiLocale">
    <div class="min-h-screen flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-md text-center">
        <NuxtLink to="/" class="inline-flex mb-8">
          <img src="/logo.svg" alt="batze" class="h-7 w-auto dark:invert">
        </NuxtLink>

        <div class="size-20 mx-auto rounded-2xl bg-elevated flex items-center justify-center mb-5">
          <UIcon
            :name="isNotFound ? 'i-lucide-search-x' : 'i-lucide-triangle-alert'"
            class="size-10 text-muted"
          />
        </div>

        <p class="text-5xl font-bold text-muted tabular-nums mb-2">{{ statusCode }}</p>

        <h1 class="text-xl font-semibold text-highlighted">
          {{ isNotFound ? t('errors.notFoundTitle') : t('errors.genericTitle') }}
        </h1>
        <p class="text-sm text-muted mt-2 max-w-sm mx-auto">
          {{ isNotFound ? t('errors.notFoundText') : t('errors.genericText') }}
        </p>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
          <UButton icon="i-lucide-arrow-left" @click="handleReturn">
            {{ t('errors.backHome') }}
          </UButton>
          <UButton
            v-if="!isNotFound"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            @click="handleReload"
          >
            {{ t('errors.reload') }}
          </UButton>
        </div>
      </div>
    </div>
  </UApp>
</template>
