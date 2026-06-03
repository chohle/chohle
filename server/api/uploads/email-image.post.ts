// Upload an image from the email editor. Stores it in the public email-asset
// store and returns an absolute URL, so the body carries <img src="https://…">
// instead of a base64 data URI (which clients like Gmail block).
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const name = await saveEmailImage(event)
  const base = ((useRuntimeConfig().siteUrl as string) || '').replace(/\/+$/, '')
  const path = `/api/email-asset/${name}`
  return { url: base ? `${base}${path}` : path }
})
