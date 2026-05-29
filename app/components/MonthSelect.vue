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
  <div class="month-select">
    <button class="icon-btn" :aria-label="$t('common.prevMonth')" @click="shift(-1)">
      <UIcon name="i-lucide-chevron-left" />
    </button>
    <span class="month-select__label mono">{{ label }}</span>
    <button class="icon-btn" :aria-label="$t('common.nextMonth')" @click="shift(1)">
      <UIcon name="i-lucide-chevron-right" />
    </button>
  </div>
</template>
