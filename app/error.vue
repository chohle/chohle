<script setup lang="ts">
import type { NuxtError } from '#app'
import * as uiLocales from '@nuxt/ui/locale'

const { error } = defineProps<{ error: NuxtError }>()

const { t, locale } = useI18n()
const uiLocale = computed(() => uiLocales[locale.value as keyof typeof uiLocales])
useTweaks()

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
    <div class="err-wrap">
      <NuxtLink to="/" class="err-brand">
        <span class="err-mark">c</span>
        <span class="err-name">chohle</span>
      </NuxtLink>

      <div class="err-code mono">{{ statusCode }}</div>
      <h1 class="err-title">
        {{ isNotFound ? t('errors.notFoundTitle') : t('errors.genericTitle')
        }}<span class="err-serif">.</span>
      </h1>
      <p class="err-desc">
        {{ isNotFound ? t('errors.notFoundText') : t('errors.genericText') }}
      </p>

      <div class="err-actions">
        <button class="ed-btn-primary" @click="handleReturn">
          <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          {{ t('errors.backHome') }}
        </button>
        <button v-if="!isNotFound" class="ed-btn-ghost" @click="handleReload">
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
          {{ t('errors.reload') }}
        </button>
      </div>
    </div>
  </UApp>
</template>
