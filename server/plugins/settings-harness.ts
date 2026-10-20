import { harnessTestMode } from './authentication-harness'
import { iamHarness } from './iam-harness'

/**
 * Composition root for the configuration layer (site, organisation and
 * group settings), with the IAM suite. Runs when the IAM suite does
 * (HARNESS_DATABASE_URL and HARNESS_IDENTITY_DATABASE_URL), after it:
 * plugins run in name order, and this one reads the IAM suite's state.
 *
 * Its ports come from the members only through the layer's own reference
 * adapters, which import no member: Identity's directory and access
 * governance, Authorisation's qualification, Authentication's principal.
 * Its tenant states come from Identity's relayed events
 * (server/plugins/iam-harness.ts). The harness serves every tenant on one
 * host name, which no tenant claims: the platform's own, where a subject
 * reaches whatever Authorisation allows.
 */
export default defineNitroPlugin((nitro) => {
  const operator = harnessDatabase()
  if (!operator || !process.env.HARNESS_IDENTITY_DATABASE_URL) return
  if (harnessTestMode) provideConfigurationClock(harnessClock)
  provideConfigurationDatabase({ dialect: 'postgres', pool: operator })

  // Migrated once, after Identity is ready; tenants that predate this start recorded.
  let ready: Promise<void> | null = null
  configurationHarness.ready = () => ready ??= (async () => {
    await migrateConfigurationDatabase()
    await iamHarness.ready
    const tenants = await operator.query<{ tenantId: string, state: 'active' | 'closing' | 'closed' }>('select tenant_id::text as "tenantId", state from identity.tenant')
    await syncConfigurationTenants(tenants.rows)
    if (iamHarness.platformGroupId) provideConfigurationPlatformGroup(iamHarness.platformGroupId)
  })()
  configurationHarness.ready().catch((error) => {
    console.error('[harness] configuration composition failed:', error instanceof Error ? error.message : error)
  })
  const identity = async () => {
    await iamHarness.ready
    return { directory: getIdentityDirectory(), governance: getIdentityAccessGovernance() }
  }

  provideConfigurationDirectory(configurationDirectoryFromIdentity({
    resolveActor: async (identityId, options) => (await identity()).directory.resolveActor(identityId, options),
    describeGroup: async (groupId, options) => (await identity()).directory.describeGroup(groupId, options)
  }))
  provideConfigurationGovernance(configurationGovernanceFromIdentity({
    describeGroup: async input => (await identity()).governance.describeGroup(input),
    isOwner: async input => (await identity()).governance.isOwner(input),
    countOwners: async input => (await identity()).governance.countOwners(input)
  }))
  provideConfigurationAccessDecision(configurationAccessDecisionFromAuthorisation({
    qualifies: authorisationQualifies,
    countQualifying: countAuthorisationQualifying
  }))
  provideConfigurationSubjectResolver(configurationSubjectResolverFromAuthentication({ getAuthenticatedPrincipal }))

  // Background work a host schedules: expiry, delayed changes and retention.
  const timer = setInterval(() => {
    runConfigurationMaintenance().catch(error => console.error('[harness] configuration maintenance failed:', error instanceof Error ? error.message : error))
  }, 60_000)
  nitro.hooks.hook('close', () => clearInterval(timer))
})
