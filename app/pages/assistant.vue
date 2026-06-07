<script setup lang="ts">
interface ProposedAction {
  type: string
  [k: string]: unknown
}
type ProposalKind =
  | 'customer'
  | 'invoice'
  | 'quote'
  | 'article'
  | 'signature'
  | 'expense'
  | 'income'
interface Proposal {
  kind: ProposalKind
  mode: 'create' | 'edit'
  summary: string[]
  before?: string[]
  action: ProposedAction
}
interface CommitRef {
  kind: string
  id: number
  label: string
}
interface Turn {
  role: 'user' | 'assistant'
  content: string
  proposals?: Proposal[]
  state?: 'pending' | 'approved' | 'cancelled'
}

const { t } = useI18n()
const toast = useToast()

// Is the assistant configured/reachable on the server?
const { data: status } = await useFetch<{ enabled: boolean; model: string | null }>(
  '/api/assistant/status',
  { default: () => ({ enabled: false, model: null }) }
)

const turns = ref<Turn[]>([])
const input = ref('')
const sending = ref(false)
const threadEl = ref<HTMLElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight, behavior: 'smooth' })
}

// The model only needs the plain user/assistant text history.
function history() {
  return turns.value.map((m) => ({ role: m.role, content: m.content }))
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  turns.value.push({ role: 'user', content: text })
  sending.value = true
  await scrollToBottom()
  try {
    const res = await $fetch<{ reply: string; proposals?: Proposal[] }>('/api/assistant/chat', {
      method: 'POST',
      body: { messages: history() }
    })
    const proposals = res.proposals ?? []
    turns.value.push({
      role: 'assistant',
      content: res.reply?.trim() || (proposals.length ? t('assistant.reviewProposal') : ''),
      proposals: proposals.length ? proposals : undefined,
      state: proposals.length ? 'pending' : undefined
    })
  } catch {
    turns.value.push({ role: 'assistant', content: t('assistant.error') })
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

async function approve(turn: Turn) {
  if (!turn.proposals || turn.state !== 'pending') return
  turn.state = 'approved'
  try {
    const result = await $fetch<{ created: CommitRef[]; updated: CommitRef[] }>(
      '/api/assistant/commit',
      { method: 'POST', body: { actions: turn.proposals.map((p) => p.action) } }
    )
    const parts: string[] = []
    for (const r of result.created)
      parts.push(
        t('assistant.createdItem', { kind: t(`assistant.kind.${r.kind}`), label: r.label })
      )
    for (const r of result.updated)
      parts.push(
        t('assistant.updatedItem', { kind: t(`assistant.kind.${r.kind}`), label: r.label })
      )
    turns.value.push({ role: 'assistant', content: parts.join(' ') || t('assistant.done') })
  } catch {
    turn.state = 'pending'
    toast.add({ title: t('assistant.commitFailed'), color: 'error' })
  } finally {
    await scrollToBottom()
  }
}

function cancel(turn: Turn) {
  if (turn.state === 'pending') turn.state = 'cancelled'
}

const KIND_ICONS: Record<ProposalKind, string> = {
  customer: 'i-lucide-user-plus',
  invoice: 'i-lucide-file-text',
  quote: 'i-lucide-file-pen',
  article: 'i-lucide-package',
  signature: 'i-lucide-signature',
  expense: 'i-lucide-receipt',
  income: 'i-lucide-banknote'
}
function kindIcon(kind: ProposalKind) {
  return KIND_ICONS[kind] ?? 'i-lucide-sparkles'
}

const suggestions = computed(() => [
  t('assistant.suggest1'),
  t('assistant.suggest2'),
  t('assistant.suggest3')
])
function useSuggestion(s: string) {
  input.value = s
}
</script>

<template>
  <div class="page-assistant">
    <UiPageHead :title="$t('assistant.title')">
      <template #subtitle>
        <span class="page-assistant__sub">
          {{ $t('assistant.subtitle') }}
          <span v-if="status.model" class="mono note">· {{ status.model }}</span>
        </span>
      </template>
    </UiPageHead>

    <div v-if="!status.enabled" class="asst-disabled">
      <UIcon name="i-lucide-sparkles" class="size-5" />
      <div>
        <p class="asst-disabled__title">{{ $t('assistant.unavailable') }}</p>
        <p class="note">{{ $t('assistant.disabledHint') }}</p>
      </div>
    </div>

    <template v-else>
      <div ref="threadEl" class="asst-thread">
        <div v-if="!turns.length" class="asst-empty">
          <UIcon name="i-lucide-sparkles" class="size-6" />
          <p>{{ $t('assistant.emptyState') }}</p>
          <div class="asst-suggest">
            <button
              v-for="s in suggestions"
              :key="s"
              type="button"
              class="asst-suggest__chip"
              @click="useSuggestion(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <div v-for="(turn, idx) in turns" :key="idx" class="asst-msg" :class="`is-${turn.role}`">
          <div class="asst-msg__meta mono">
            {{ turn.role === 'user' ? $t('assistant.you') : $t('assistant.name') }}
          </div>
          <div v-if="turn.content" class="asst-msg__bubble">{{ turn.content }}</div>

          <!-- Approval cards for proposed creates / edits -->
          <div v-if="turn.proposals" class="asst-proposals">
            <div v-for="(p, pi) in turn.proposals" :key="pi" class="asst-card">
              <div class="asst-card__head">
                <UIcon :name="kindIcon(p.kind)" class="size-4" />
                <span>{{ $t(`assistant.${p.mode}.${p.kind}`) }}</span>
              </div>
              <!-- Edit: show before -> after so the user can double check. -->
              <div v-if="p.before" class="asst-diff">
                <div class="asst-diff__col">
                  <span class="asst-diff__label mono">{{ $t('assistant.before') }}</span>
                  <span v-for="(b, bi) in p.before" :key="bi">{{ b }}</span>
                </div>
                <UIcon name="i-lucide-arrow-right" class="asst-diff__arrow size-4" />
                <div class="asst-diff__col">
                  <span class="asst-diff__label mono">{{ $t('assistant.after') }}</span>
                  <span v-for="(a, ai) in p.summary" :key="ai">{{ a }}</span>
                </div>
              </div>
              <ul v-else class="asst-card__lines">
                <li v-for="(line, li) in p.summary" :key="li">{{ line }}</li>
              </ul>
            </div>

            <div v-if="turn.state === 'pending'" class="asst-actions">
              <button class="ed-btn" type="button" @click="approve(turn)">
                <UIcon name="i-lucide-check" class="size-3.5" /> {{ $t('assistant.approve') }}
              </button>
              <button class="ed-btn-ghost" type="button" @click="cancel(turn)">
                {{ $t('assistant.cancel') }}
              </button>
            </div>
            <p v-else-if="turn.state === 'approved'" class="asst-state mono">
              {{ $t('assistant.approved') }}
            </p>
            <p v-else-if="turn.state === 'cancelled'" class="asst-state mono note">
              {{ $t('assistant.cancelled') }}
            </p>
          </div>
        </div>

        <div v-if="sending" class="asst-msg is-assistant">
          <div class="asst-msg__meta mono">{{ $t('assistant.name') }}</div>
          <div class="asst-msg__bubble asst-thinking">{{ $t('assistant.thinking') }}</div>
        </div>
      </div>

      <form class="asst-input" @submit.prevent="send">
        <UInput
          v-model="input"
          :placeholder="$t('assistant.placeholder')"
          :disabled="sending"
          autocomplete="off"
          class="asst-input__field"
        />
        <button class="ed-btn" type="submit" :disabled="sending || !input.trim()">
          <UIcon name="i-lucide-send" class="size-3.5" /> {{ $t('assistant.send') }}
        </button>
      </form>
    </template>
  </div>
</template>
