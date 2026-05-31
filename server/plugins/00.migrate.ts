// Open the database and apply pending migrations once at server startup.
export default defineNitroPlugin(() => {
  const { applied } = runMigrations(useDb())
  if (applied.length) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`)
  }
})
