<script setup lang="ts">
/**
 * The harness's header in either state: sign-in and sign-up for anonymous
 * visitors; the account menu, and on small screens the modules, once signed in.
 */
const { isAuthenticated, needsSecondFactor, signOut } = useAuthentication()
const routes = useRuntimeConfig().public.authentication.routes
const signedIn = computed(() => isAuthenticated.value && !needsSecondFactor.value)
const modules = HARNESS_MODULES.map(({ label, icon, to }) => ({ label, icon, to }))

async function leave() {
  await signOut()
  await navigateTo(routes.afterSignOut)
}

const account = computed(() => [
  ...(signedIn.value ? [{ label: 'Security', icon: 'i-lucide-shield-check', to: routes.security }] : []),
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: leave }
])
</script>

<template>
  <UHeader :toggle="signedIn">
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
      <UDropdownMenu
        v-if="isAuthenticated"
        :items="account"
      >
        <UButton
          label="Account"
          icon="i-lucide-circle-user"
          variant="ghost"
        />
      </UDropdownMenu>
      <template v-else>
        <UButton
          :to="routes.signIn"
          label="Sign in"
          variant="subtle"
        />
        <UButton
          :to="routes.signUp"
          label="Create an account"
          variant="ghost"
          class="hidden sm:inline-flex"
        />
      </template>
    </template>

    <template
      v-if="signedIn"
      #body
    >
      <UNavigationMenu
        :items="modules"
        orientation="vertical"
        aria-label="Modules"
      />
    </template>
  </UHeader>
</template>
