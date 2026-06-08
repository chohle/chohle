// Executes the actions the user approved in the chat. This is the only write
// path; it re-validates everything and only ever CREATES. Each call writes one
// audit row recording exactly what was approved and the resulting ids.
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'
import { commitActions, type ProposedAction } from '~~/server/utils/assistant/commit'

/*
 * Don't duplicate customer contact details into the audit log; the action shape
 * (types, names, amounts) is enough to know what was done. Names/titles stay so
 * the trail is still meaningful.
 */
const SENSITIVE = new Set([
  'email',
  'phone',
  'street',
  'zip',
  'contactPerson',
  'contact_person',
  'notes',
  'vendor',
  'contentHtml',
  'content_html',
  'social',
  'website',
  'uid',
  'mwst',
  'hrNumber',
  'hr_number'
])
/** Deep-clone a value, replacing any sensitive field's value with "[redacted]". */
function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE.has(k) ? '[redacted]' : redact(val)
    }
    return out
  }
  return v
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  assertAssistantEnabled()

  const body = await readBody<{ actions?: ProposedAction[]; prompt?: string }>(event)
  const actions = Array.isArray(body?.actions) ? body!.actions : []
  if (actions.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No actions to commit' })
  }

  const db = useDb()
  const username = (session.user as { username?: string })?.username ?? null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, 2000) : null
  const redacted = JSON.stringify(redact(actions))

  try {
    const result = commitActions(db, actions)
    db.prepare(
      `INSERT INTO assistant_audit (username, prompt, proposed_actions, result, status)
       VALUES (?, ?, ?, ?, 'committed')`
    ).run(username, prompt, redacted, JSON.stringify(result))
    return result
  } catch (err) {
    // Best-effort failure record (the data transaction already rolled back).
    try {
      db.prepare(
        `INSERT INTO assistant_audit (username, prompt, proposed_actions, status)
         VALUES (?, ?, ?, 'failed')`
      ).run(username, prompt, redacted)
    } catch {
      /* ignore audit write failure */
    }
    throw err
  }
})
