/**
 * Host routing decision: Theme Manager's administration pages require a
 * signed-in actor in this application. Reuses the Authentication layer's
 * `authenticated` rules (sign-in, then enrol or step up). This is only a user
 * experience guard; Theme Manager's API enforces access through the actor and
 * Authorization adapters. Without a database there is no Theme storage (and no
 * sign-in): the pages are read-only, so they open without signing in.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/theme-manager')) return
  const { storage } = await useThemeCapabilities()
  if (!storage.value) return
  const { isAuthenticated, needsSecondFactor, ready, refresh } = useAuthentication()
  if (!ready.value) await refresh()
  const { signIn, mfa } = useRuntimeConfig().public.authentication.routes
  if (!isAuthenticated.value) return navigateTo({ path: signIn, query: { redirect: to.fullPath } })
  if (needsSecondFactor.value) return navigateTo({ path: mfa, query: { redirect: to.fullPath } })
})
