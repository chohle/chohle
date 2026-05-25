<script setup lang="ts">
const { t } = useI18n()
const { user } = useUserSession()
const toast = useToast()

const form = reactive({ current: '', next: '', confirm: '' })
const error = ref('')
const saving = ref(false)

async function changePassword() {
  error.value = ''
  if (form.next.length < 8) {
    error.value = t('profile.errTooShort')
    return
  }
  if (form.next !== form.confirm) {
    error.value = t('profile.errMismatch')
    return
  }
  saving.value = true
  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: form.current, newPassword: form.next }
    })
    toast.add({ title: t('profile.toastChanged'), color: 'success' })
    form.current = ''
    form.next = ''
    form.confirm = ''
  } catch {
    error.value = t('profile.errGeneric')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader :title="$t('user.profile')" :description="$t('profile.subtitle')" />

    <UCard>
      <UFormField :label="$t('common.username')">
        <UInput :model-value="user?.username" disabled class="w-full" />
      </UFormField>
    </UCard>

    <UCard class="mt-6">
      <template #header>
        <h2 class="font-semibold">{{ $t('profile.changePassword') }}</h2>
      </template>
      <form class="space-y-4" @submit.prevent="changePassword">
        <UFormField :label="$t('profile.currentPassword')">
          <UInput v-model="form.current" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField :label="$t('profile.newPassword')">
          <UInput v-model="form.next" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField :label="$t('profile.confirmPassword')">
          <UInput v-model="form.confirm" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <p v-if="error" class="text-error text-sm">{{ error }}</p>
        <div class="flex justify-end">
          <UButton type="submit" :loading="saving">{{ $t('profile.changePassword') }}</UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>