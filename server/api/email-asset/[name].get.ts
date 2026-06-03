// Public: serve an email image referenced from a sent message (the recipient
// has no session). Only the email-asset subdirectory is exposed; private
// receipts in the uploads root are not reachable here.
export default defineEventHandler((event) => {
  return serveEmailAsset(event, getRouterParam(event, 'name'))
})
