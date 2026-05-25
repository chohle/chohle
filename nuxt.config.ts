// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    langDir: 'locales',
    lazy: true,
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
      title: 'batze',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon/apple-touch-icon.png' },
        { rel: 'shortcut icon', href: '/favicon/favicon.ico' }
      ]
    }
  },
  runtimeConfig: {
    adminUsername: '',
    adminPassword: '',
    smtp: {
      host: '',
      port: '1025'
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
