// Save a conversation's turns (and title). The UI calls this after each
// exchange so a reload restores the chat. Stores the turns blob as-is.
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'

// Guard against an unbounded blob (a very long chat). ~1 MB of JSON is plenty.
const MAX_TURNS_BYTES = 1_000_000

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const body = await readBody<{ title?: string; turns?: unknown }>(event)
  if (!Array.isArray(body?.turns)) {
    throw createError({ statusCode: 400, statusMessage: 'turns must be an array' })
  }
  const turnsJson = JSON.stringify(body.turns)
  if (Buffer.byteLength(turnsJson, 'utf8') > MAX_TURNS_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Conversation too large' })
  }
  const title = String(body?.title ?? '').slice(0, 200)
  // Update directly and treat 0 rows as not-found (avoids a check-then-write race).
  const info = useDb()
    .prepare(
      "UPDATE assistant_conversations SET title = ?, turns = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(title, turnsJson, id)
  if (info.changes === 0) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return { ok: true }
})
