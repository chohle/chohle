<script setup lang="ts">
import { CalendarDate, parseDate } from '@internationalized/date'

defineProps<{ disabled?: boolean }>()

const modelValue = defineModel<string>()

const display = computed(() => dateCh(modelValue.value ?? ''))

const calendarValue = computed<CalendarDate | null>(() => {
  if (!modelValue.value) return null
  try {
    return parseDate(modelValue.value)
  } catch {
    return null
  }
})

const open = ref(false)
function onCalendar(v: CalendarDate | null) {
  modelValue.value = v ? v.toString() : ''
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'date-picker__pop' }">
    <UInput
      :model-value="display"
      :disabled="disabled"
      readonly
      icon="i-lucide-calendar"
      autocomplete="off"
      class="date-picker w-full"
    />
    <template #content>
      <UCalendar
        :model-value="calendarValue"
        :first-day-of-week="1"
        locale="de-CH"
        @update:model-value="onCalendar"
      />
    </template>
  </UPopover>
</template>
