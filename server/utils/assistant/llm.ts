// Minimal OpenAI-compatible chat client. Works against any endpoint that speaks
// the /chat/completions protocol with function calling — Ollama (default), LM
// Studio, llama.cpp, vLLM, or a hosted API — selected entirely via env, so the
// app code never changes when you swap models/providers.
import type { OpenAITool } from './tools'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

interface AssistantConfig {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string
}

/** Read the assistant runtime config (enabled, base URL, model, api key). */
export function assistantConfig(): AssistantConfig {
  const c = useRuntimeConfig().assistant as Partial<AssistantConfig> | undefined
  return {
    enabled: !!c?.enabled,
    baseUrl: (c?.baseUrl || 'http://ollama:11434/v1').replace(/\/+$/, ''),
    model: c?.model || 'qwen2.5:7b',
    apiKey: c?.apiKey || ''
  }
}

/** Gate shared by every assistant endpoint: enabled, and never in the demo. */
export function assertAssistantEnabled(): void {
  if (isDemo()) throw createError({ statusCode: 403, statusMessage: 'Disabled in the demo' })
  if (!assistantConfig().enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Assistant is not enabled' })
  }
}

const REQUEST_TIMEOUT_MS = 120_000

interface CompletionResponse {
  choices?: { message?: ChatMessage }[]
}

/**
 * One round-trip to the model. Returns the assistant message (which may carry
 * tool_calls). Throws a 502 on transport/parse failure so the endpoint can
 * surface a clean "assistant unavailable".
 */
export async function chatCompletion(
  messages: ChatMessage[],
  tools: OpenAITool[]
): Promise<ChatMessage> {
  const cfg = assistantConfig()
  let res: CompletionResponse
  try {
    res = await $fetch<CompletionResponse>(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
      body: {
        model: cfg.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
        stream: false
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    // Any transport failure (unreachable host, timeout, HTTP error from the
    // model server) becomes a clean 502 the UI can show as "unavailable".
    throw createError({ statusCode: 502, statusMessage: 'Could not reach the assistant model' })
  }
  const message = res?.choices?.[0]?.message
  if (!message) {
    throw createError({ statusCode: 502, statusMessage: 'Empty response from the LLM' })
  }
  return message
}

/**
 * Tool-call arguments arrive as a JSON string; small models sometimes wrap them
 * in prose or emit nothing. Parse defensively so a bad payload becomes a
 * recoverable tool error rather than crashing the loop.
 */
export function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw createError({ statusCode: 400, statusMessage: 'Could not parse tool arguments' })
  }
}

export const SYSTEM_PROMPT = `You are the assistant inside "chohle", a Swiss single-user invoicing app.
You help the owner read their data and draft or edit records.

Rules:
- You can READ data freely with the read tools.
- To change anything, call a "propose_" tool. You do NOT write directly — the user reviews and approves every proposal in the chat. Never claim something was saved; say you have prepared it for approval.
- You can CREATE customers, invoices, quotes, articles, signatures, expenses and income sources, and EDIT customers, invoices, quotes, articles and signatures.
- You can NEVER delete anything and you can NEVER send emails. If asked, explain that deleting and sending are done by the owner.
- Before editing a record, READ it first (get_invoice / get_quote / list_* / find_customer) so you change the right one. For an edit, pass the record id and only the fields to change; to change invoice/quote line items, pass the FULL new lines array.
- To bill or quote a customer, ALWAYS call find_customer (or list_customers) FIRST to check whether they already exist, and use the id you get back. Only use newCustomer when find_customer returns no match. Never invent a new customer for one that already exists. If the user says "this/the customer" but you are unsure which one, look it up or ask, do not create a new one.
- For an expense category, call list_categories and pass the category name.
- All prices/amounts are in CHF. The default Swiss VAT (MWST) rate is 8.1 unless told otherwise.
- Invoices and quotes are created as drafts with no number; the owner assigns the number later.
- Be concise. Ask a brief clarifying question only when essential (e.g. a missing price).`
