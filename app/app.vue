<script setup lang="ts">
// The shell follows the routing convention (app/utils/harness-routes.ts): the
// signed-in application, with its modules menu, only for a session at the
// policy's required level; everything else in the public layout.
const route = useRoute()
const { isAuthenticated, needsSecondFactor, ready, refresh } = useAuthentication()
if (!ready.value) await refresh()
const layout = computed(() => {
  const signedIn = isAuthenticated.value && !needsSecondFactor.value
  const inApplication = harnessRouteAccess(route.name) === 'signed-in' || route.name === 'index'
  return signedIn && inApplication ? 'signed-in' : 'default'
})

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
    <HarnessHeader />
    <NuxtLayout :name="layout">
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
