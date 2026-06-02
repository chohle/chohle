// Open the database and apply pending migrations once at server startup.
export default defineNitroPlugin(() => {
  // Demo mode has no shared db; each per-session sandbox is migrated when built
  // from a template (see server/utils/demo.ts).
  if (isDemo()) return
  const { applied } = runMigrations(useDb())
  if (applied.length) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`)
  }
})
