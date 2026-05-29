<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  ariaLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const buttons = ref<HTMLButtonElement[]>([])

function select(value: string, index: number) {
  emit('update:modelValue', value)
  nextTick(() => buttons.value[index]?.focus())
}

function onKey(e: KeyboardEvent, index: number) {
  const last = props.options.length - 1
  let next = index
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = last
  else return
  e.preventDefault()
  const opt = props.options[next]
  if (opt) select(opt.value, next)
}
</script>
<template>
  <div class="seg-ctrl" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      ref="buttons"
      class="seg-ctrl__opt mono"
      :class="{ 'is-active': o.value === modelValue }"
      type="button"
      role="radio"
      :aria-checked="o.value === modelValue"
      :tabindex="o.value === modelValue ? 0 : -1"
      @click="select(o.value, i)"
      @keydown="onKey($event, i)"
    >{{ o.label }}</button>
  </div>
</template>
