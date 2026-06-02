<script setup lang="ts">
// Reusable "are you sure?" dialog, driven programmatically through
// `useConfirm()` and the Nuxt UI overlay system. The overlay provider binds
// `open` and listens for `@close`, whose payload resolves the confirm promise:
// `true` = confirmed, `false` = cancelled / dismissed.
defineProps<{
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
}>()

const emit = defineEmits<{ close: [boolean] }>()
const { t } = useI18n()
</script>

<template>
  <UModal
    :title="title ?? t('common.deleteTitle')"
    @update:open="
      (value: boolean) => {
        if (!value) emit('close', false)
      }
    "
  >
    <template #body>
      <p>{{ description ?? t('common.deleteConfirm') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button class="ed-btn-ghost" @click="emit('close', false)">
          {{ cancelLabel ?? t('common.cancel') }}
        </button>
        <button class="ed-btn-primary" @click="emit('close', true)">
          {{ confirmLabel ?? t('common.delete') }}
        </button>
      </div>
    </template>
  </UModal>
</template>
