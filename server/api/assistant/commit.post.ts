// Executes the actions the user approved in the chat. This is the only write
// path; it re-validates everything and only ever CREATES. Each call writes one
// audit row recording exactly what was approved and the resulting ids.
import { assistantConfig } from '~~/server/utils/assistant/llm'
import { commitActions, type ProposedAction } from '~~/server/utils/assistant/commit'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (isDemo()) throw createError({ statusCode: 403, statusMessage: 'Disabled in the demo' })
  if (!assistantConfig().enabled) {
    throw createError({ statusCode: 404, statusMessage: 'Assistant is not enabled' })
  }

  const body = await readBody<{ actions?: ProposedAction[]; prompt?: string }>(event)
  const actions = Array.isArray(body?.actions) ? body!.actions : []
  if (actions.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No actions to commit' })
  }

  const db = useDb()
  const username = (session.user as { username?: string })?.username ?? null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, 2000) : null

  try {
    const result = commitActions(db, actions)
    db.prepare(
      `INSERT INTO assistant_audit (username, prompt, proposed_actions, result, status)
       VALUES (?, ?, ?, ?, 'committed')`
    ).run(username, prompt, JSON.stringify(actions), JSON.stringify(result))
    return result
  } catch (err) {
    // Best-effort failure record (the data transaction already rolled back).
    try {
      db.prepare(
        `INSERT INTO assistant_audit (username, prompt, proposed_actions, status)
         VALUES (?, ?, ?, 'failed')`
      ).run(username, prompt, JSON.stringify(actions))
    } catch {
      /* ignore audit write failure */
    }
    throw err
  }
})
