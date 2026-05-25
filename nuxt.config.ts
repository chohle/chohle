// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'batze',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]
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
    }
  }
})
