// Shared implementation of the sender and customer logo endpoints. The six
// routes perform the same three operations (serve, replace, remove) and
// differ only in table + row, so each route file stays a thin wrapper.
// Table names come from this fixed union, never from user input.
import type { H3Event } from 'h3'
import type { Database } from 'better-sqlite3'

type LogoTable = 'sender' | 'customers'

function logoRow(db: Database, table: LogoTable, id: number) {
  return db.prepare(`SELECT logo_path FROM ${table} WHERE id = ?`).get(id) as
    | { logo_path: string | null }
    | undefined
}

// GET: stream the stored logo. Auth and caching stay in the route handlers
// (the sender logo is public + long-cached, customer logos need a session).
export function serveLogo(event: H3Event, table: LogoTable, id: number) {
  return serveUpload(event, logoRow(useDb(), table, id)?.logo_path)
}

// POST: store the uploaded image and delete the previous one. `createRow`
// is for the singleton sender row, which may not exist yet; without it a
// missing row is a 404 (unknown customer).
export async function replaceLogo(
  event: H3Event,
  table: LogoTable,
  id: number,
  opts: { allowedTypes?: readonly string[]; createRow?: boolean } = {}
) {
  const db = useDb()
  if (opts.createRow) {
    db.prepare(`INSERT OR IGNORE INTO ${table} (id) VALUES (?)`).run(id)
  }
  const current = logoRow(db, table, id)
  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const storedName = await saveImageUpload(event, opts.allowedTypes)
  db.prepare(`UPDATE ${table} SET logo_path = ? WHERE id = ?`).run(storedName, id)
  // Best-effort cleanup after the DB points at the new file: a filesystem
  // hiccup here must not fail the request or orphan the fresh upload.
  try {
    await deleteUpload(current.logo_path)
  } catch {
    // Old file stays behind on disk; harmless and retried on the next replace.
  }
  return { ok: true }
}

// DELETE: remove the stored file and clear the column.
export async function removeLogo(table: LogoTable, id: number) {
  const db = useDb()
  const row = logoRow(db, table, id)
  await deleteUpload(row?.logo_path)
  db.prepare(`UPDATE ${table} SET logo_path = NULL WHERE id = ?`).run(id)
  return { ok: true }
}
