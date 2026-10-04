/**
 * Host routing decision: Theme Manager's administration pages require a
 * signed-in actor in this application. Reuses the Authentication layer's
 * `authenticated` rules (sign-in, then enrol or step up). This is only a user
 * experience guard; Theme Manager's API enforces access through the actor and
 * Authorization adapters.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/theme-manager')) return
  const { isAuthenticated, needsSecondFactor, ready, refresh } = useAuthentication()
  if (!ready.value) await refresh()
  const { signIn, mfa } = useRuntimeConfig().public.authentication.routes
  if (!isAuthenticated.value) return navigateTo({ path: signIn, query: { redirect: to.fullPath } })
  if (needsSecondFactor.value) return navigateTo({ path: mfa, query: { redirect: to.fullPath } })
})
