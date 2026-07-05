// Public on purpose: branded emails reference the logo by absolute URL, and the
// recipient opening the mail has no session. It's only the company logo (the
// same image printed on invoices sent to customers) — no sensitive data.
export default defineEventHandler(async (event) => {
  // URL is cache-busted with ?v=<stored-name>, so let clients cache hard.
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return serveLogo(event, 'sender', 1)
})
