interface SqliteError {
  code?: string
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  try {
    const { changes } = useDb().prepare(`DELETE FROM projects WHERE id = ?`).run(id)
    if (changes === 0) {
      throw createError({ statusCode: 404, statusMessage: 'project not found' })
    }
    return { ok: true }
  } catch (err) {
    // Migration 0029 added ON DELETE RESTRICT on invoices.project_id, so a
    // project that produced invoices can't be deleted until those invoices
    // are removed first. Surface a clear 409 instead of a generic 500.
    const code = (err as SqliteError).code
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || code === 'SQLITE_CONSTRAINT_TRIGGER') {
      throw createError({
        statusCode: 409,
        statusMessage: 'project has linked invoices, delete those first'
      })
    }
    throw err
  }
})
