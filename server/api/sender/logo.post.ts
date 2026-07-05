export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  // PNG only: the logo is embedded in the invoice/quote PDF, where PNG renders
  // reliably and keeps transparency. Other raster types are rejected here.
  // createRow: the singleton sender row may not exist yet.
  return replaceLogo(event, 'sender', 1, { allowedTypes: ['image/png'], createRow: true })
})
