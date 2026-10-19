/**
 * Host composition decision: a Theme created in Theme Manager's editor belongs
 * to the person who creates it. Theme Manager takes the new Theme's owner from
 * public runtime config and refuses to create one its actor does not own, so the
 * harness keeps that owner in step with the signed-in principal (the actor's id,
 * server/plugins/theme-manager-harness.ts). In the browser only: the server's
 * runtime config is shared by every request.
 */
export default defineNuxtPlugin(() => {
  const themeManager = useRuntimeConfig().public.themeManager as { creationOwnerId: string }
  const { principal } = useAuthentication()
  watch(() => principal.value?.principalId, (id) => {
    themeManager.creationOwnerId = id ?? ''
  }, { immediate: true })
})
