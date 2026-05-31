<script setup lang="ts">
interface Segment {
  label: string
  value: number
  weight?: 1 | 2 | 3
}
const props = withDefaults(
  defineProps<{
    segments: Segment[]
    size?: number
    label?: string
    centerValue?: string
  }>(),
  { size: 160 }
)

const total = computed(() => props.segments.reduce((s, x) => s + x.value, 0) || 1)
const radius = 42
const circumference = 2 * Math.PI * radius
const segments = computed(() => {
  let cum = 0
  return props.segments.map((s) => {
    const frac = s.value / total.value
    const dash = frac * circumference
    const offset = -cum * circumference
    cum += frac
    return { dash, offset, weight: s.weight ?? 1 }
  })
})
function color(w: 1 | 2 | 3) {
  return w === 1 ? 'var(--ink)' : w === 2 ? 'var(--ink-3)' : 'var(--ink-4)'
}
</script>
<template>
  <div class="donut" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :viewBox="`0 0 100 100`" :width="size" :height="size">
      <circle cx="50" cy="50" :r="radius" fill="none" stroke="var(--border)" stroke-width="10" />
      <g transform="rotate(-90 50 50)">
        <circle
          v-for="(s, i) in segments"
          :key="i"
          cx="50"
          cy="50"
          :r="radius"
          fill="none"
          :stroke="color(s.weight)"
          stroke-width="10"
          :stroke-dasharray="`${s.dash} ${circumference - s.dash}`"
          :stroke-dashoffset="s.offset"
        />
      </g>
    </svg>
    <div class="donut__center">
      <div v-if="label" class="donut__lbl mono">{{ label }}</div>
      <div v-if="centerValue" class="donut__val mono tabular">{{ centerValue }}</div>
    </div>
  </div>
</template>
