// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Peers: no layer extends another. The harness is the composition root, and
  // connects the IAM members only through @nuxt4-layers/iam-integration's adapters.
  extends: ['@nuxt4-layers/theme-manager', '@nuxt4-layers/authentication', '@nuxt4-layers/identity', '@nuxt4-layers/authorisation', '@nuxt4-layers/profile', '@nuxt4-layers/iam-integration'],

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
