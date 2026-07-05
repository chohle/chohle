// Shared preamble for [id]-style routes: read the router param, coerce to a
// number, and 400 on anything that isn't an integer. Auto-imported, so
// handlers can just do `const id = requireIdParam(event)`.
import type { H3Event } from 'h3'

export function requireIdParam(event: H3Event, name = 'id'): number {
  const id = Number(getRouterParam(event, name))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  return id
}
