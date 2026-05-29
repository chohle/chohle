<script setup lang="ts">
const props = withDefaults(defineProps<{
  values: number[]
  width?: number
  height?: number
  filled?: boolean
}>(), { width: 220, height: 42, filled: true })

const path = computed(() => {
  const v = props.values
  if (!v.length) return ''
  const min = Math.min(...v)
  const max = Math.max(...v)
  const range = max - min || 1
  // Single-value sparkline draws a dot at the horizontal centre instead
  // of dividing by zero on (v.length - 1).
  const denom = v.length - 1 || 1
  return v.map((n, i) => {
    const x = v.length === 1 ? props.width / 2 : (i / denom) * props.width
    const y = props.height - ((n - min) / range) * props.height
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
})

const area = computed(() => `${path.value} L ${props.width} ${props.height} L 0 ${props.height} Z`)
</script>
<template>
  <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" preserveAspectRatio="none">
    <path v-if="filled" :d="area" fill="var(--ink)" fill-opacity="0.12" />
    <path :d="path" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>
