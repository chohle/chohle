<script setup lang="ts">
definePageMeta({ layout: false })

const { fetch: refreshSession } = useUserSession()
const state = reactive({ username: '', password: '' })
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { ...state } })
    await refreshSession()
    await navigateTo('/')
  } catch {
    error.value = 'Invalid username or password.'
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

      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <UFormField label="Username">
          <UInput v-model="state.username" autocomplete="username" class="w-full" />
        </UFormField>
        <UFormField label="Password">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
        <UButton type="submit" :loading="loading" block>Sign in</UButton>
      </form>
    </UCard>
  </div>
</template>
