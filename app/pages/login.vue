<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const { fetch: refreshSession } = useUserSession()
useTweaks()
const state = reactive({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

function validate(s: typeof state) {
  const errors: { name: string, message: string }[] = []
  if (!s.username) errors.push({ name: 'username', message: t('validation.required') })
  if (!s.password) errors.push({ name: 'password', message: t('validation.required') })
  return errors
}

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { ...state } })
    await refreshSession()
    await navigateTo('/')
  } catch {
    error.value = t('login.invalid')
  } finally { loading.value = false }
}
</script>

<template>
  <div class="page-login">
    <div class="page-login__card">
      <div class="page-login__brand">
        <span class="page-login__mark">b</span>
        <span class="page-login__name">batze</span>
      </div>
      <p class="page-login__welcome">Sign in to your workspace<span class="page-login__serif">.</span></p>

      <UForm :state="state" :validate="validate" novalidate class="page-login__form" @submit="onSubmit">
        <UFormField name="username" :label="$t('common.username')">
          <UInput v-model="state.username" autocomplete="username" class="w-full" />
        </UFormField>
        <UFormField name="password" :label="$t('common.password')">
          <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <p v-if="error" class="page-login__err">{{ error }}</p>
        <button type="submit" class="ed-btn-primary page-login__submit" :disabled="loading">{{ $t('login.signIn') }}</button>
      </UForm>
    </div>
  </div>
</template>
