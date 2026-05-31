import { defineConfig } from 'vitest/config'

// Lightweight vitest setup for pure utility modules under server/utils/.
// Anything that needs Nuxt's auto-imports (useDb, requireUserSession, etc.)
// should be tested via @nuxt/test-utils instead, which we haven't added yet.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    reporters: 'default'
  }
})
