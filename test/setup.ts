// Global test setup. We don't need Nuxt's runtime here, but the modules
// under test do reference `$fetch` (Nuxt auto-import). Stub it so any
// accidental call surfaces as a clear test failure instead of an
// undefined-function crash.

import { vi } from 'vitest'
import { createError } from 'h3'

// Several server utils call h3's `createError` as a Nitro auto-import. Provide
// it globally so they behave the same under vitest (no Nuxt runtime here).
vi.stubGlobal('createError', createError)

// Default: any unmocked $fetch call throws. Individual tests override
// with `vi.stubGlobal('$fetch', ...)`.
const defaultFetch = vi.fn(async () => {
  throw new Error('$fetch was called without a per-test stub being installed')
})
vi.stubGlobal('$fetch', defaultFetch)

// outlookSync.ts encrypts/decrypts via CHOHLE_SECRET. Set a deterministic
// value so encrypt+decrypt round-trips work in tests.
process.env.CHOHLE_SECRET ??= 'test-secret-for-vitest-runs-only'
