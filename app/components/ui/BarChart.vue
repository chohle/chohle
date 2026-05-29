<script setup lang="ts">
interface Series { values: number[]; weight?: 1 | 2 | 3 }
const props = withDefaults(defineProps<{
  series: Series[]
  labels?: string[]
  height?: number
  stacked?: boolean
}>(), { height: 200, stacked: true })

const height = props.height
// Length to render against — the shortest series so missing buckets at
// the tail of any series can't produce undefined arithmetic / NaN bars.
const n = computed(() => {
  if (!props.series.length) return 0
  return Math.min(...props.series.map(s => s.values.length))
})

function valueAt(series: { values: number[] }, i: number): number {
  return series.values[i] ?? 0
}

const max = computed(() => {
  const count = n.value
  if (props.stacked) {
    let m = 0
    for (let i = 0; i < count; i++) {
      m = Math.max(m, props.series.reduce((s, ser) => s + valueAt(ser, i), 0))
    }
    return m || 1
  }
  let m = 0
  for (let i = 0; i < count; i++) {
    for (const ser of props.series) m = Math.max(m, valueAt(ser, i))
  }
  return m || 1
})

function fill(weight: 1 | 2 | 3 = 1) {
  return weight === 1 ? 'var(--ink)' : weight === 2 ? 'var(--ink-3)' : 'var(--ink-4)'
}

const colW = computed(() => 100 / (n.value || 1))
const barW = computed(() => colW.value * 0.6)
const padX = computed(() => (colW.value - barW.value) / 2)
</script>
<template>
  <div class="bar-chart">
    <svg :viewBox="`0 0 100 ${height}`" :height="height" width="100%" preserveAspectRatio="none">
      <line v-for="g in [0.25, 0.5, 0.75, 1]" :key="g" x1="0" :y1="height - height * g" x2="100" :y2="height - height * g" stroke="var(--border)" stroke-width="0.5" vector-effect="non-scaling-stroke" />
      <template v-for="(_, i) in n" :key="i">
        <template v-for="(s, si) in series" :key="si">
          <rect
            :x="i * colW + padX"
            :y="(() => {
              const stack = stacked ? series.slice(0, si + 1).reduce((sum, ss) => sum + valueAt(ss, i), 0) : valueAt(s, i)
              return height - (stack / max) * height
            })()"
            :width="barW"
            :height="(valueAt(s, i) / max) * height"
            :fill="fill(s.weight)"
            rx="0.6"
          />
        </template>
      </template>
    </svg>
    <div v-if="labels" class="bar-chart__labels">
      <span v-for="(l, i) in labels" :key="i" class="bar-chart__lbl mono">{{ l }}</span>
    </div>
  </div>
</template>
