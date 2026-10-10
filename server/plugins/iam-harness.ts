import pg from 'pg'
import { DEFAULT_AUTHORISATION_POLICY } from '@nuxt4-layers/authorisation/contracts'
import type { IdentityEvent } from '@nuxt4-layers/identity/contracts'
import type { ProfileEvent } from '@nuxt4-layers/profile/contracts'
import { PROFILE_PERMISSIONS } from '@nuxt4-layers/profile/contracts'
import { IDENTITY_PERMISSIONS } from '@nuxt4-layers/identity/contracts'
import {
  authenticationIdentityFromIdentity,
  authorisationDirectoryFromIdentity,
  createAuthenticationEventHandler,
  createIdentityEventHandler,
  createProfileEventHandler,
  identityAccessDecisionFromAuthorisation,
  identityApprovalPolicyFromAuthorisation,
  identitySubjectResolverFromAuthentication,
  invitationSenderFromIdentity,
  newCorrelationId,
  profileAccessDecisionFromAuthorisation,
  profileRequestCoordinatorFromMembers,
  reconcileCredentialRecoveries,
  rolesWithIdentityPermissions
} from '@nuxt4-layers/iam-integration/adapters'
import type { InvitationSender } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from './authentication-harness'

/**
 * Composition root for the IAM suite: Identity, Authentication,
 * Authorisation and Profile, connected only through iam-integration's
 * reference adapters (no member imports another). Runs when both database
 * URLs are set:
 *
 * - HARNESS_DATABASE_URL           the migration (owner) role; Authentication's
 *                                  and Authorisation's schemas, Identity's and
 *                                  Profile's migrations
 * - HARNESS_IDENTITY_DATABASE_URL  Identity's runtime role, which owns nothing
 *                                  and cannot bypass row-level security
 *
 * Profile joins when, in addition, these are set:
 *
 * - HARNESS_PROFILE_DATABASE_URL   Profile's runtime role, which owns nothing
 * - HARNESS_PROFILE_MASTER_KEY     32 bytes, base64: the key that wraps each
 *                                  person's data key (a KMS in production)
 *
 * Profile then coordinates data-subject requests across the members, keeps
 * legal holds (which the Identity event handler honours on closure), sends
 * verification codes through the harness's notifier, and asks Authorisation
 * before naming a group's suspended members to its administrators.
 *
 * Without them, the missing members' ports are absent and they fail closed,
 * and Authentication runs on its own, as before.
 */
export interface IamHarness {
  /** Resolves once Identity is migrated and its default tenant exists. */
  ready: Promise<void>
  /** The migration role's pool, for the operator's procedures. */
  operator: pg.Pool | null
  tenantId: string | null
  platformGroupId: string | null
  /** Identity's and Profile's events as relayed, for the test probes (test mode only). */
  events: (IdentityEvent | ProfileEvent)[]
  /** Whether Profile is composed. */
  profile: boolean
  /** Verification codes Profile asked the harness to deliver, newest last (test mode only; never logged). */
  codes: { attribute: string, code: string }[]
  /** Invitation links the harness delivered, newest last (test mode only; never logged). */
  invitations: { address: string, link: string, kind: 'member' | 'guest' }[]
  /** Break-glass enrolment links issued to the platform's operators, newest last (test mode only; never logged). */
  breakGlassLinks: { identityId: string, link: string }[]
}

export const iamHarness: IamHarness = { ready: Promise.resolve(), operator: null, tenantId: null, platformGroupId: null, events: [], profile: false, codes: [], invitations: [], breakGlassLinks: [] }

/**
 * The host's invitation delivery, through iam-integration's invitation
 * sender: Identity issues an invitation bound to nobody, and the harness
 * delivers the link. A real host sends it by email; the harness records it
 * for the test probes and logs neither the address nor the link.
 */
export async function invitationSender(): Promise<InvitationSender> {
  await iamHarness.ready
  const base = process.env.NUXT_IDENTITY_BASE_URL
  if (!base) throw Object.assign(new Error('NUXT_IDENTITY_BASE_URL is not set'), { code: 'unavailable' })
  return invitationSenderFromIdentity({
    joining: getIdentityJoining(),
    acceptanceUrl: new URL('/invitations/accept', base).href,
    async deliver({ address, link, kind }) {
      if (harnessTestMode) iamHarness.invitations.push({ address, link, kind })
      console.info(`[harness notifier] ${kind} invitation`)
    }
  })
}

/** Authentication's break-glass enrolment page, with the token in the fragment. */
export function breakGlassEnrolmentLink(token: string): string {
  return `${new URL('/break-glass/enrol', process.env.NUXT_IDENTITY_BASE_URL).href}#${token}`
}

/** Delivers a break-glass enrolment link to the platform's operators: recorded for the test probes, never logged. */
export function deliverBreakGlassLink(identityId: string, link: string): void {
  if (harnessTestMode) iamHarness.breakGlassLinks.push({ identityId, link })
  console.info('[harness notifier] break-glass enrolment link to the platform operators')
}

/** Identity's and Profile's permissions, for Authorisation's catalogue and roles. */
const PERMISSIONS = [...IDENTITY_PERMISSIONS, ...PROFILE_PERMISSIONS]

/** Supplies Identity's policy: the harness tenant is every sign-up's home tenant. */
export function applyIdentityPolicy(): void {
  provideIdentityPolicy({ defaultHomeTenantId: iamHarness.tenantId, platformGroupId: iamHarness.platformGroupId })
}

/** Relays Identity's outbox, then Profile's, until both are empty: what the timers do, for the test probes. */
export async function relayIdentityNow(): Promise<void> {
  await iamHarness.ready
  for (;;) {
    const result = await relayIdentityOutbox({ limit: 100 })
    if (result.published === 0 || result.failed > 0) break
  }
  if (iamHarness.profile) {
    while (await relayProfileOutbox({ limit: 100, publish: publishProfileEvent }) > 0) { /* until empty */ }
  }
}

/**
 * Profile's events: a legal hold that ends lets Authentication and
 * Authorisation erase what it kept of a closed identity; the test probes
 * record them all.
 */
const handleProfileEvent = createProfileEventHandler({
  deleteAccount: deleteAuthenticationAccount,
  erasePrincipal: eraseAuthorisationPrincipal,
  recordRequestPart: recordProfileRequestPart
})

async function publishProfileEvent(event: ProfileEvent): Promise<void> {
  await handleProfileEvent(event)
  if (harnessTestMode) iamHarness.events.push(event)
}

/**
 * Profile: migrated with the owner role, used through its own runtime role,
 * each person's key wrapped by the harness's master key, and Identity's
 * disclosure context and Authentication's principal through the host.
 */
function composeProfile(operator: pg.Pool): boolean {
  const runtimeUrl = process.env.HARNESS_PROFILE_DATABASE_URL
  const masterKey = process.env.HARNESS_PROFILE_MASTER_KEY
  if (!runtimeUrl || !masterKey) return false
  provideProfileDatabase({
    dialect: 'postgres',
    pool: new pg.Pool({ connectionString: runtimeUrl, max: 5 }),
    migrationPool: operator,
    runtimeRole: decodeURIComponent(new URL(runtimeUrl).username)
  })
  migrateProfileDatabase()
  provideProfileKeyWrapper(createLocalProfileKeyWrapper({ keys: { 'harness-1': masterKey }, current: 'harness-1' }))
  provideProfileDisclosureContext({
    async describe(request, options) {
      await iamHarness.ready
      return getIdentityDisclosureContext().describe(request, options)
    }
  })
  provideProfileSubjectResolver(identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal }))
  // Data-subject requests: each member's export, through iam-integration's coordinator.
  provideProfileRequestCoordinator(profileRequestCoordinatorFromMembers({
    exportIdentity: async (input) => {
      await iamHarness.ready
      return exportIdentityData(input)
    },
    exportAuthentication: exportAuthenticationData,
    exportAuthorisation: exportAuthorisationData
  }))
  // Whether a viewer may see a group's suspended members, from Authorisation.
  provideProfileAccessDecision(profileAccessDecisionFromAuthorisation({ authorise }))
  // Verification codes: a real host sends them by email or SMS. The harness
  // records them for the test probes and logs neither the address nor the code.
  provideProfileNotifier({
    async send(message) {
      if (harnessTestMode) iamHarness.codes.push({ attribute: message.attribute, code: message.code })
      console.info(`[harness notifier] ${message.purpose} by ${message.channel}`)
    }
  })
  return true
}

export default defineNitroPlugin((nitro) => {
  const operator = harnessDatabase()
  const runtimeUrl = process.env.HARNESS_IDENTITY_DATABASE_URL
  if (!operator || !runtimeUrl) return
  iamHarness.operator = operator
  // One clock for every member (iam-integration's architecture §7): in test
  // mode, the harness clock the probe moves forward; otherwise the system clock.
  if (harnessTestMode) {
    provideIdentityClock(harnessClock)
    provideAuthorisationClock(harnessClock)
    provideProfileClock(harnessClock)
  }
  const runtimeRole = decodeURIComponent(new URL(runtimeUrl).username)

  // Identity: migrated with the owner role, then used through the runtime role.
  iamHarness.ready = (async () => {
    await migrateIdentityDatabase({ pool: operator, runtimeRole })
    provideIdentityDatabase({ dialect: 'postgres', pool: new pg.Pool({ connectionString: runtimeUrl, max: 5 }) })
    const tenant = await operator.query<{ id: string }>('select tenant_id::text as id from identity.tenant order by created_at limit 1')
    iamHarness.tenantId = tenant.rows[0]?.id
      ?? (await provisionIdentityTenant({ pool: operator, jurisdiction: 'uk-gdpr', dataRegion: 'uk', correlationId: newCorrelationId() })).tenantId
    const root = await operator.query<{ id: string }>(
      'select group_id::text as id from identity."group" where tenant_id = $1 and parent_group_id is null and kind = \'standard\' order by created_at limit 1',
      [iamHarness.tenantId]
    )
    iamHarness.platformGroupId = root.rows[0]?.id ?? null
    applyIdentityPolicy()
  })()
  iamHarness.ready.catch((error) => {
    console.error('[harness] Identity composition failed:', error instanceof Error ? error.message : error)
  })
  const once = <T>(run: () => T) => async () => {
    await iamHarness.ready
    return run()
  }
  const provisioning = once(() => getIdentityProvisioning())
  const directory = once(() => getIdentityDirectory())

  // Authorisation: its own schema; Identity's permissions in its catalogue and roles.
  provideAuthorisationDatabase({ dialect: 'postgres', pool: operator })
  migrateAuthorisationDatabase()
  provideAuthorisationPermissions(PERMISSIONS.map(({ name, description, risk, effect }) => ({ name, description, risk, effect })))
  provideAuthorisationPolicy({ roles: rolesWithIdentityPermissions({ permissions: PERMISSIONS, roles: DEFAULT_AUTHORISATION_POLICY.roles }) })
  provideAuthorisationDirectory(authorisationDirectoryFromIdentity({
    directory: {
      resolveActor: async (id, options) => (await directory()).resolveActor(id, options),
      describeGroup: async (id, options) => (await directory()).describeGroup(id, options)
    }
  }))

  // Identity's ports, from Authentication and Authorisation.
  provideIdentitySubjectResolver(identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal }))
  provideIdentityAccessDecision(identityAccessDecisionFromAuthorisation({ authorise }))
  provideIdentityApprovalPolicy(identityApprovalPolicyFromAuthorisation({
    riskOf: permission => PERMISSIONS.find(definition => definition.name === permission)?.risk ?? null,
    qualifies: authorisationQualifies,
    countQualifying: countAuthorisationQualifying
  }))
  iamHarness.profile = composeProfile(operator)
  const handleIdentityEvent = createIdentityEventHandler({
    applyProfileEvent: iamHarness.profile ? applyProfileIdentityEvent : undefined,
    revokeSessions: revokeAuthenticationSessions,
    discardAccount: discardAuthenticationAccount,
    deleteAccount: deleteAuthenticationAccount,
    erasePrincipal: eraseAuthorisationPrincipal,
    // Legal holds and data-subject requests are Profile's.
    heldParts: iamHarness.profile ? profileLegalHoldParts : undefined,
    recordRequestPart: iamHarness.profile ? recordProfileRequestPart : undefined,
    assignRole: assignAuthorisationRole,
    unassignRole: unassignAuthorisationRole,
    // After every break-glass use: a new passkey, enrolled through a link to the platform's operators.
    breakGlass: {
      rotate: rotateAuthenticationBreakGlass,
      enrolmentUrl: new URL('/break-glass/enrol', process.env.NUXT_IDENTITY_BASE_URL ?? 'http://localhost:3000').href,
      async deliver({ identityId, link }) {
        deliverBreakGlassLink(identityId, link)
      }
    }
  })
  provideIdentityEventPublisher({
    async publish(event) {
      await handleIdentityEvent(event)
      if (harnessTestMode) iamHarness.events.push(event)
    }
  })

  // Authentication's identity port, from Identity's provisioning port.
  provideAuthenticationIdentity(authenticationIdentityFromIdentity({
    provisioning: {
      reserve: async input => (await provisioning()).reserve(input),
      confirm: async input => (await provisioning()).confirm(input),
      signInStatus: async id => (await provisioning()).signInStatus(id)
    }
  }))

  // Credential recovery: Authentication's event, and reconciliation from its records.
  const record = async (input: { identityId: string, recoveredAt: string, correlationId: string }) => {
    await iamHarness.ready
    return recordIdentityCredentialRecovery(input)
  }
  harnessAuthenticationListeners.push(createAuthenticationEventHandler({ record }))
  let recoveryCursor: string | null = null

  // Background work a host schedules: the outbox relay, maintenance and reconciliation.
  const every = (ms: number, what: string, run: () => Promise<unknown>) => {
    const timer = setInterval(() => {
      run().catch(error => console.error(`[harness] ${what} failed:`, error instanceof Error ? error.message : error))
    }, ms)
    nitro.hooks.hook('close', () => clearInterval(timer))
  }
  every(2_000, 'outbox relay', relayIdentityNow)
  every(60_000, 'Identity maintenance', async () => {
    await iamHarness.ready
    await runIdentityMaintenance()
  })
  if (iamHarness.profile) {
    every(60_000, 'Profile key re-wrapping', () => rewrapProfileKeys())
    every(60_000, 'Profile maintenance', () => runProfileMaintenance())
  }
  every(60_000, 'credential recovery reconciliation', async () => {
    const result = await reconcileCredentialRecoveries({ list: listAuthenticationCredentialRecoveries, record, after: recoveryCursor })
    recoveryCursor = result.after
  })
})
