// Load one conversation's title + turns (the chat the UI re-renders).
import { assertAssistantEnabled } from '~~/server/utils/assistant/llm'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertAssistantEnabled()
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const row = useDb()
    .prepare('SELECT title, turns FROM assistant_conversations WHERE id = ?')
    .get(id) as { title: string; turns: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  let turns: unknown
  try {
    turns = JSON.parse(row.turns)
  } catch {
    turns = []
  }
  return { id, title: row.title, turns }
})
