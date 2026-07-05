import DOMPurify from 'isomorphic-dompurify'

// Sanitize server-provided HTML (email bodies, previews) before v-html.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
