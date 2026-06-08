// Delete a saved conversation (user-initiated history cleanup).
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  useDb().prepare('DELETE FROM assistant_conversations WHERE id = ?').run(id)
  return { ok: true }
})
