<script setup lang="ts">
// Public pages: no modules menu. Layer pages bring their own <main> landmark.
const route = useRoute()
</script>

<template>
  <UMain :as="harnessPageOwnsMain(route.name) ? 'div' : 'main'">
    <slot />
  </UMain>
</template>
