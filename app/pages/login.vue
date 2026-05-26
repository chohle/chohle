<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const { fetch: refreshSession } = useUserSession()
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
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-default text-default p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <img src="/logo.svg" alt="batze" class="h-7 w-auto mx-auto dark:invert">
      </template>

      <UForm :state="state" :validate="validate" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField name="username" :label="$t('common.username')">
          <UInput v-model="state.username" autocomplete="username" class="w-full" />
        </UFormField>
        <UFormField name="password" :label="$t('common.password')">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
        <UButton type="submit" :loading="loading" block>{{ $t('login.signIn') }}</UButton>
      </UForm>
    </UCard>
  </div>
</template>
