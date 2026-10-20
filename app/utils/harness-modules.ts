/**
 * The modules of the signed-in application, in the order of its side menu.
 * A new module adds one entry here; its pages need no guard of their own
 * (app/utils/harness-routes.ts). `to` is the module's first page.
 */
export interface HarnessModule {
  label: string
  icon: string
  to: string
}

export const HARNESS_MODULES: readonly HarnessModule[] = [
  { label: 'Theme Manager', icon: 'i-lucide-palette', to: '/theme-manager' },
  { label: 'Groups', icon: 'i-lucide-users', to: '/account/groups' },
  { label: 'Profile', icon: 'i-lucide-id-card', to: '/profile' },
  { label: 'Data requests', icon: 'i-lucide-file-archive', to: '/profile/requests' },
  { label: 'Security', icon: 'i-lucide-shield-check', to: '/account/security' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/configuration' }
]
