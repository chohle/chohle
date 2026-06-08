// Create a new (empty) conversation; returns its id.
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()
  const info = useDb()
    .prepare("INSERT INTO assistant_conversations (title, turns) VALUES ('', '[]')")
    .run()
  return { id: Number(info.lastInsertRowid) }
})
