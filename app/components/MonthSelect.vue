<script setup lang="ts">
const model = defineModel<string>({ required: true })
const { locale } = useI18n()

function shift(delta: number) {
  const [y, m] = model.value.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1 + delta, 1)
  model.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const label = computed(() => {
  const [y, m] = model.value.split('-').map(Number) as [number, number]
  return new Date(y, m - 1, 1).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
})
</script>

<template>
  <div class="inline-flex items-center rounded-md border border-default bg-default shadow-sm">
    <UButton
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      :aria-label="$t('common.prevMonth')"
      class="rounded-r-none"
      @click="shift(-1)"
    />
    <span class="px-1 text-sm font-medium tabular-nums min-w-32 text-center select-none">
      {{ label }}
    </span>
    <UButton
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      :aria-label="$t('common.nextMonth')"
      class="rounded-l-none"
      @click="shift(1)"
    />
  </div>
</template>