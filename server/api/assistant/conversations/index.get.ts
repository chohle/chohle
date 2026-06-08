// List saved assistant conversations, most recently updated first.
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()
  return {
    conversations: useDb()
      .prepare(
        'SELECT id, title, updated_at FROM assistant_conversations ORDER BY updated_at DESC, id DESC'
      )
      .all()
  }
})
