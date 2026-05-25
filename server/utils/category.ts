export interface CategoryInput {
  name: string
  type: string
  color: string
  icon: string
}

export function parseCategory(body: Record<string, unknown>): CategoryInput {
  const name = String(body?.name ?? '').trim()
  const type = String(body?.type ?? '')
  const color = String(body?.color ?? '').trim()
  const icon = String(body?.icon ?? '').trim()

  if (!name || !['expense', 'income'].includes(type) || !color || !icon) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
  }

  return { name, type, color, icon }
}