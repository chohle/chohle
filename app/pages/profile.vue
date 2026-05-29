<script setup lang="ts">
const { t } = useI18n()
const { user } = useUserSession()
const toast = useToast()

const form = reactive({ current: '', next: '', confirm: '' })
const error = ref('')
const saving = ref(false)

function validate(state: typeof form) {
  const errors: { name: string, message: string }[] = []
  if (!state.current) errors.push({ name: 'current', message: t('validation.required') })
  if (!state.next) errors.push({ name: 'next', message: t('validation.required') })
  else if (state.next.length < 8) errors.push({ name: 'next', message: t('profile.errTooShort') })
  if (state.next !== state.confirm) errors.push({ name: 'confirm', message: t('profile.errMismatch') })
  return errors
}

async function changePassword() {
  error.value = ''
  saving.value = true
  try {
    await $fetch('/api/auth/change-password', { method: 'POST', body: { currentPassword: form.current, newPassword: form.next } })
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
  <div class="page-profile">
    <UiPageHead crumb="System / Profile" :title="$t('user.profile')" :subtitle="$t('profile.subtitle')" />

    <UiCard>
      <UFormField :label="$t('common.username')">
        <UInput :model-value="user?.username" disabled class="w-full" />
      </UFormField>
    </UiCard>

    <UiSectionLabel>{{ $t('profile.changePassword') }}</UiSectionLabel>

    <UiCard>
      <UForm :state="form" :validate="validate" class="page-profile__form" @submit="changePassword">
        <UFormField name="current" :label="$t('profile.currentPassword')">
          <UInput v-model="form.current" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField name="next" :label="$t('profile.newPassword')">
          <UInput v-model="form.next" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UFormField name="confirm" :label="$t('profile.confirmPassword')">
          <UInput v-model="form.confirm" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <p v-if="error" class="page-profile__err">{{ error }}</p>
        <div class="page-profile__foot">
          <button type="submit" class="ed-btn-primary" :disabled="saving">{{ $t('profile.changePassword') }}</button>
        </div>
      </UForm>
    </UiCard>
  </div>
</template>

