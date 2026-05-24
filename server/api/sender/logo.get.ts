export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const row = useDb().prepare('SELECT logo_path FROM sender WHERE id = 1').get() as
    | { logo_path: string | null }
    | undefined
  return serveUpload(event, row?.logo_path)
})
