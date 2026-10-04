// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Peers: neither layer extends the other. The harness is the composition root.
  extends: ['@nuxt4-layers/theme-manager', '@nuxt4-layers/authentication'],

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      themeManager: {
        creationTemplateId: 'test-theme',
        creationOwnerType: 'user',
        creationOwnerId: 'test-user'
      }
    }
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    // Lets the Theme Manager actor adapter read the current request (useEvent),
    // since ThemeActorContextProvider.getActorContext() receives no event.
    experimental: { asyncContext: true }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
