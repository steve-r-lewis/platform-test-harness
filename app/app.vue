<script setup lang="ts">
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
        <NuxtLink to="/" class="font-semibold">
          Theme Manager Test Harness
        </NuxtLink>
      </template>

      <template #right>
        <UColorModeButton />
        <UButton to="/theme-manager" label="Theme Manager" variant="subtle" />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>
  </UApp>
</template>
