// Whether the assistant is usable, so the client can render the chat (or a
// "not configured" hint) without probing the LLM.
import { assistantConfig } from '~~/server/utils/assistant/llm'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const cfg = assistantConfig()
  return { enabled: cfg.enabled && !isDemo(), model: cfg.enabled ? cfg.model : null }
})
