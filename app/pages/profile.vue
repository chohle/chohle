<script setup lang="ts">
const { user } = useUserSession()
const toast = useToast()

const form = reactive({ current: '', next: '', confirm: '' })
const error = ref('')
const saving = ref(false)

async function changePassword() {
  error.value = ''
  if (form.next.length < 8) {
    error.value = 'New password must be at least 8 characters.'
    return
  }
  if (form.next !== form.confirm) {
    error.value = 'New passwords do not match.'
    return
  }
  saving.value = true
  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: form.current, newPassword: form.next }
    })
    toast.add({ title: 'Password changed', color: 'success' })
    form.current = ''
    form.next = ''
    form.confirm = ''
  } catch {
    error.value = 'Could not change password. Check your current password.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-md">
    <h1 class="text-2xl font-bold">Profile</h1>
    <p class="text-muted mt-1">Your account and password.</p>

    <UCard class="mt-6">
      <UFormField label="Username">
        <UInput :model-value="user?.username" disabled class="w-full" />
      </UFormField>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">Change password</h2>
      </template>
      <form class="space-y-4" @submit.prevent="changePassword">
        <UFormField label="Current password">
          <UInput v-model="form.current" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField label="New password">
          <UInput v-model="form.next" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField label="Confirm new password">
          <UInput v-model="form.confirm" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">Change password</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>