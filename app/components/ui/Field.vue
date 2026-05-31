<script setup lang="ts">
defineProps<{ label?: string; modelValue?: string | number; type?: string; placeholder?: string }>()
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>
<template>
  <label class="ed-field">
    <span v-if="label" class="ed-field__label">{{ label }}</span>
    <slot>
      <input
        :type="type ?? 'text'"
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </slot>
  </label>
</template>
