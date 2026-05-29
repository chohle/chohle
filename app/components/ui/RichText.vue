<script setup lang="ts">
// Minimal inline-emphasis renderer used by the activity feed. Supports
// **bold** and *italic* only — anything else passes through as plain
// text. Inputs come from server responses, but the API escapes any raw
// * / _ in user-controlled strings before composing the message so we
// only see emphasis we put there ourselves.

const props = defineProps<{ text: string }>()

interface Token { kind: 'text' | 'bold' | 'italic'; value: string }

function tokenise(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let buf = ''

  function flushText() {
    if (buf) { tokens.push({ kind: 'text', value: buf }); buf = '' }
  }

  while (i < input.length) {
    const ch = input[i]!
    const next = input[i + 1]
    // Escaped markers come through as `\*` / `\_`.
    if (ch === '\\' && (next === '*' || next === '_')) {
      buf += next
      i += 2
      continue
    }
    if (ch === '*' && next === '*') {
      const end = input.indexOf('**', i + 2)
      if (end > -1) {
        flushText()
        tokens.push({ kind: 'bold', value: input.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    if (ch === '*') {
      const end = input.indexOf('*', i + 1)
      if (end > -1) {
        flushText()
        tokens.push({ kind: 'italic', value: input.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    buf += ch
    i++
  }
  flushText()
  return tokens
}

const tokens = computed(() => tokenise(props.text))
</script>

<template>
  <span class="rich-text">
    <template v-for="(t, i) in tokens" :key="i">
      <strong v-if="t.kind === 'bold'">{{ t.value }}</strong>
      <em v-else-if="t.kind === 'italic'">{{ t.value }}</em>
      <template v-else>{{ t.value }}</template>
    </template>
  </span>
</template>
