import { CONFIGURATION_PERMISSIONS } from '@nuxt4-layers/configuration-service/contracts'

/**
 * The configuration layer's permissions, for Authorisation's catalogue and
 * roles (server/plugins/iam-harness.ts): owners hold the high and critical
 * ones by name, every role the low and medium ones through its wildcards.
 */
const DESCRIPTIONS: Record<string, string> = {
  'configuration.settings:view': 'See a scope\'s settings and the changes awaiting a decision',
  'configuration.group-settings:manage': 'Request and approve changes to a group\'s settings',
  'configuration.tenant-settings:manage': 'Request and approve changes to an organisation\'s settings',
  'configuration.platform-settings:manage': 'Request and approve changes to the platform\'s settings'
}

export const CONFIGURATION_HARNESS_PERMISSIONS = CONFIGURATION_PERMISSIONS.map(({ permission, risk, effect }) => ({
  name: permission,
  description: DESCRIPTIONS[permission] ?? permission,
  risk,
  effect: effect === 'view' ? 'view' as const : 'change' as const
}))

/**
 * Set by server/plugins/settings-harness.ts when the configuration layer is
 * composed (with the IAM suite): resolves once its schema is migrated and the
 * tenants Identity already holds are recorded.
 */
export const configurationHarness: { ready: (() => Promise<void>) | null } = { ready: null }

/** Applies one of Identity's relayed events to the configuration layer, when it is composed. */
export async function applyIdentityEventToConfiguration(event: unknown): Promise<void> {
  if (!configurationHarness.ready) return
  await configurationHarness.ready()
  await applyConfigurationIdentityEvent(event)
}
