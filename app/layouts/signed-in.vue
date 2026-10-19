<script setup lang="ts">
// The signed-in application: the modules menu beside the page (in the header's
// menu on small screens). Layer pages bring their own <main> landmark.
const route = useRoute()
const modules = HARNESS_MODULES.map(({ label, icon, to }) => ({ label, icon, to }))
</script>

<template>
  <div class="flex">
    <aside class="hidden w-60 shrink-0 border-r border-default p-4 lg:block">
      <UNavigationMenu
        :items="modules"
        orientation="vertical"
        aria-label="Modules"
      />
    </aside>
    <UMain
      :as="harnessPageOwnsMain(route.name) ? 'div' : 'main'"
      class="min-w-0 flex-1"
    >
      <slot />
    </UMain>
  </div>
</template>
