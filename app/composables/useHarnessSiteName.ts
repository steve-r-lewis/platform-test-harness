/**
 * The site's name for this host name, from the configuration layer's
 * `site.name` (the platform's, or a tenant's), or the harness's own when the
 * layer has none to give.
 */
export function useHarnessSiteName() {
  const name = useConfiguration().value<string>('site.name')
  return computed(() => name.value ?? HARNESS_SITE_NAME)
}
