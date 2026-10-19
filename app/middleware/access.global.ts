/**
 * Applies the routing convention (app/utils/harness-routes.ts) to every
 * navigation: anonymous visitors go to sign-in, sessions below the policy's
 * required level to the second-factor page. The session is read again at each
 * navigation into the signed-in application, so one that ended elsewhere (signed
 * out in another tab, expired, revoked) is noticed at once. A user-experience
 * guard only: the APIs enforce access on the server.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (harnessRouteAccess(to.name) === 'public') return
  const { isAuthenticated, needsSecondFactor, refresh } = useAuthentication()
  await refresh()
  const { signIn, mfa } = useRuntimeConfig().public.authentication.routes
  if (!isAuthenticated.value) return navigateTo({ path: signIn, query: { redirect: to.fullPath } })
  if (needsSecondFactor.value) return navigateTo({ path: mfa, query: { redirect: to.fullPath } })
})
