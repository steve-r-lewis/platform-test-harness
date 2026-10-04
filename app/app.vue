<script setup lang="ts">
// Layer pages that supply their own <main> landmark (the Authentication
// layer's pages are named `authentication-*`) render inside a plain
// container, so each page has exactly one main landmark.
const route = useRoute()
const pageOwnsMain = computed(() => String(route.name ?? '').startsWith('authentication-'))

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'Theme Manager Test Harness',
  description: 'Black-box integration harness for the Nuxt 4 Theme Manager layer.'
})
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          to="/"
          class="font-semibold"
        >
          Theme Manager Test Harness
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
        <UButton
          to="/theme-manager"
          label="Theme Manager"
          variant="subtle"
        />
      </template>
    </UHeader>

    <UMain :as="pageOwnsMain ? 'div' : 'main'">
      <NuxtPage />
    </UMain>
  </UApp>
</template>
