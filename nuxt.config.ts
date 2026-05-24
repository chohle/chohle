// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Overridden at runtime by NUXT_SMTP_HOST / NUXT_SMTP_PORT.
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
