// Basic RFC-ish check, good enough to catch typos like "aadsf" without
// rejecting valid edge cases. Server is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}
