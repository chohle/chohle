// Remove the bank connection, reverting to manual-upload-only. Imported
// transactions are untouched (they live in bank_imports / bank_transactions).

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  useDb().prepare('DELETE FROM bank_connections').run()
  return { ok: true }
})
