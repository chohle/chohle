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
interface ConversationMeta {
  id: number
  title: string
  updated_at: string
}

const { t } = useI18n()
const toast = useToast()

// Is the assistant configured/reachable on the server?
const { data: status } = await useFetch<{ enabled: boolean; model: string | null }>(
  '/api/assistant/status',
  { default: () => ({ enabled: false, model: null }) }
)

const conversations = ref<ConversationMeta[]>([])
const activeId = ref<number | null>(null)
const turns = ref<Turn[]>([])
const input = ref('')
const sending = ref(false)
const threadEl = ref<HTMLElement | null>(null)

// Saved chat history loads on the client (needs auth + avoids SSR coupling).
onMounted(async () => {
  if (!status.value.enabled) return
  try {
    const res = await $fetch<{ conversations: ConversationMeta[] }>('/api/assistant/conversations')
    conversations.value = res.conversations
    if (conversations.value.length) await openConversation(conversations.value[0]!.id)
  } catch {
    /* leave an empty new chat */
  }
})

async function scrollToBottom() {
  await nextTick()
  threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight, behavior: 'smooth' })
}

function history() {
  return turns.value.map((m) => ({ role: m.role, content: m.content }))
}

// Title a conversation from its first user message.
function deriveTitle(): string {
  const first = turns.value.find((m) => m.role === 'user')?.content?.trim()
  return first ? first.slice(0, 60) : t('assistant.untitled')
}

// Make sure there's a row to save into; create one lazily on first message.
async function ensureConversation(): Promise<number> {
  if (activeId.value) return activeId.value
  const { id } = await $fetch<{ id: number }>('/api/assistant/conversations', { method: 'POST' })
  activeId.value = id
  conversations.value.unshift({ id, title: '', updated_at: new Date().toISOString() })
  return id
}

async function saveConversation() {
  if (!activeId.value) return
  const title = deriveTitle()
  try {
    await $fetch(`/api/assistant/conversations/${activeId.value}`, {
      method: 'PUT',
      body: { title, turns: turns.value }
    })
    // Reflect the new title and bump it to the top of the rail.
    const meta = conversations.value.find((c) => c.id === activeId.value)
    if (meta) {
      meta.title = title
      meta.updated_at = new Date().toISOString()
      conversations.value.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    }
  } catch {
    /* a failed autosave shouldn't interrupt the chat */
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  turns.value.push({ role: 'user', content: text })
  sending.value = true
  await scrollToBottom()
  try {
    await ensureConversation()
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
    await saveConversation()
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
    await saveConversation()
    await scrollToBottom()
  }
}

async function cancel(turn: Turn) {
  if (turn.state === 'pending') {
    turn.state = 'cancelled'
    await saveConversation()
  }
}

function newChat() {
  activeId.value = null
  turns.value = []
  input.value = ''
}

async function openConversation(id: number) {
  if (sending.value) return
  try {
    const res = await $fetch<{ id: number; turns: Turn[] }>(`/api/assistant/conversations/${id}`)
    activeId.value = res.id
    turns.value = Array.isArray(res.turns) ? res.turns : []
    await scrollToBottom()
  } catch {
    toast.add({ title: t('assistant.error'), color: 'error' })
  }
}

async function deleteConversation(id: number) {
  try {
    await $fetch(`/api/assistant/conversations/${id}`, { method: 'DELETE' })
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      if (conversations.value.length) await openConversation(conversations.value[0]!.id)
      else newChat()
    }
  } catch {
    toast.add({ title: t('assistant.error'), color: 'error' })
  }
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

    <div v-else class="asst-layout">
      <!-- Saved conversations -->
      <aside class="asst-rail">
        <button class="asst-rail__new ed-btn" type="button" @click="newChat">
          <UIcon name="i-lucide-plus" class="size-3.5" /> {{ $t('assistant.newChat') }}
        </button>
        <ul class="asst-rail__list">
          <li
            v-for="c in conversations"
            :key="c.id"
            class="asst-conv"
            :class="{ 'is-active': c.id === activeId }"
          >
            <button type="button" class="asst-conv__open" @click="openConversation(c.id)">
              {{ c.title || $t('assistant.untitled') }}
            </button>
            <button
              type="button"
              class="icon-btn asst-conv__del"
              :aria-label="$t('common.delete')"
              @click.stop="deleteConversation(c.id)"
            >
              <UIcon name="i-lucide-trash-2" />
            </button>
          </li>
        </ul>
      </aside>

      <section class="asst-main">
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
      </section>
    </div>
  </div>
</template>
