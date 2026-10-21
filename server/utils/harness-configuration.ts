import { z } from 'zod'
import { CONFIGURATION_PERMISSIONS, defineConfigurationSetting } from '@nuxt4-layers/configuration/contracts'

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

/** The harness's own settings: how often a person would like a summary of their notices (stored only; the harness sends none). */
export const HARNESS_CONFIGURATION_SETTINGS = [
  defineConfigurationSetting({ key: 'harness.notices', schema: z.enum(['daily', 'weekly', 'never']), scopes: ['platform', 'account'], visibility: 'members', sensitivity: 'organisational', risk: 'low', default: 'weekly' })
]

/**
 * Set by server/plugins/settings-harness.ts when the configuration layer is
 * composed (with the IAM suite): resolves once its schema is migrated and the
 * tenants Identity already holds are recorded.
 */
export const configurationHarness: { ready: (() => Promise<void>) | null } = { ready: null }

/**
 * Relays the configuration layer's outbox until it is empty, when it is
 * composed. Its events carry identifiers, keys and codes, never a value; a
 * real host forwards them to its event bus, the harness to `publish`.
 */
export async function relayConfigurationEvents(publish: (event: unknown) => void): Promise<void> {
  if (!configurationHarness.ready) return
  await configurationHarness.ready()
  while (await relayConfigurationOutbox({ limit: 100, publish: async event => publish(event) }) > 0) { /* until empty */ }
}

/** The configuration layer's part of a tenant's export (its and its groups' values and history), when it is composed. */
export async function exportTenantConfiguration(tenantId: string) {
  if (!configurationHarness.ready) return null
  await configurationHarness.ready()
  return exportConfigurationTenantData({ tenantId })
}

/** The configuration layer's part of a person's data-subject access request: their own account settings, when it is composed. */
export async function exportAccountConfiguration(input: { identityId: string }) {
  if (!configurationHarness.ready) return null
  await configurationHarness.ready()
  return exportConfigurationAccountData(input)
}

/** Applies one of Identity's relayed events to the configuration layer, when it is composed. */
export async function applyIdentityEventToConfiguration(event: unknown): Promise<void> {
  if (!configurationHarness.ready) return
  await configurationHarness.ready()
  await applyConfigurationIdentityEvent(event)
}
