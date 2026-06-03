// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@nuxtjs/i18n'],
  // Don't follow the visitor's OS theme: our editorial theme is driven by
  // `data-theme` and defaults to light. Pin color-mode to light so Nuxt UI
  // components match on SSR / first paint; useTweaks syncs it afterwards.
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },
  css: ['~/assets/css/main.css', '~/assets/scss/main.scss'],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    langDir: 'locales',
    // Locale is a stored preference, not browser-sniffed; default stays English.
    detectBrowserLanguage: false,
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'it', name: 'Italiano', file: 'it.json' }
    ]
  },
  app: {
    head: {
      title: 'chohle',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/chohle.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' },
        { rel: 'shortcut icon', href: '/favicon/favicon.ico' }
      ]
    }
  },
  // Demo mode (CHOHLE_DEMO=true) gives every visitor an isolated, per-session
  // sandbox database. It needs Nitro's async context so a request-scoped db can
  // be resolved from any server util via useEvent(). Off in normal deployments.
  nitro: {
    experimental: {
      asyncContext: true
    }
  },
  runtimeConfig: {
    adminUsername: '',
    adminPassword: '',
    smtp: {
      host: '',
      port: '1025',
      // Auth is optional: left blank for the no-auth Mailpit dev relay, set in
      // production (NUXT_SMTP_USER / NUXT_SMTP_PASS) for a real provider like
      // example. The user is normally the full sending address (hello@chohle.ch).
      user: '',
      pass: '',
      // Leave blank to derive from the port (465 → implicit TLS, else STARTTLS).
      // Set NUXT_SMTP_SECURE=true/false only to override that default.
      secure: ''
    },
    public: {
      demo: process.env.CHOHLE_DEMO === 'true'
    }
  },
  // Bind-mounted source on macOS doesn't emit fs events; poll inside Docker.
  vite: {
    server: {
      watch: process.env.DOCKER ? { usePolling: true } : undefined
    },
    optimizeDeps: {
      include: [
        '@tiptap/extension-list',
        '@tiptap/extension-text-align',
        '@tiptap/core',
        '@tiptap/vue-3',
        // Dedupe ProseMirror so direct tiptap imports share Nuxt UI's instance.
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor'
      ]
    }
  }
})
