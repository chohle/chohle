// Runs one assistant turn: feeds the conversation to the model with the tool
// registry, executes any READ tools, and collects any PROPOSE tool calls. It
// NEVER writes — proposals are returned for the user to approve, then committed
// separately via /api/assistant/commit.
import {
  assertAssistantEnabled,
  chatCompletion,
  parseToolArgs,
  SYSTEM_PROMPT,
  type ChatMessage
} from '~~/server/utils/assistant/llm'
import {
  ALL_TOOLS,
  buildProposal,
  isProposeTool,
  runReadTool,
  type Proposal
} from '~~/server/utils/assistant/tools'

const MAX_ITERATIONS = 6

/** Extract a short message from a thrown error (h3 statusMessage or message). */
function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { statusMessage?: string; message?: string }
    return o.statusMessage || o.message || 'error'
  }
  return 'error'
}

/**
 * Keep only plain user/assistant text from the client; tool messages and
 * tool_calls are server-internal and must not be injectable from the browser.
 */
function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (m): m is { role: string; content: unknown } =>
        !!m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant')
    )
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-20)
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()

  const body = await readBody<{ messages?: unknown }>(event)
  const history = sanitizeHistory(body?.messages)
  if (history.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No message' })
  }

  const convo: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
  const proposals: Proposal[] = []

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const message = await chatCompletion(convo, ALL_TOOLS)
    convo.push(message)

    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      return { reply: message.content ?? '', proposals: [] }
    }

    let proposedThisRound = false
    for (const call of calls) {
      const name = call.function?.name ?? ''
      let resultContent: string
      try {
        const args = parseToolArgs(call.function?.arguments)
        if (isProposeTool(name)) {
          const proposal = buildProposal(name, args)
          proposals.push(proposal)
          proposedThisRound = true
          resultContent = JSON.stringify({ ok: true, prepared: proposal.kind })
        } else {
          resultContent = JSON.stringify(runReadTool(name, args))
        }
      } catch (e) {
        // Feed the error back so the model can self-correct within the loop.
        resultContent = JSON.stringify({ error: errorMessage(e) })
      }
      convo.push({ role: 'tool', tool_call_id: call.id, name, content: resultContent })
    }

    // A proposal ends the turn: hand it to the user for approval.
    if (proposedThisRound) {
      return { reply: message.content ?? '', proposals }
    }
  }

  // Ran out of iterations without converging.
  return { reply: '', proposals, exhausted: true }
})
