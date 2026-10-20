import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness, relayIdentityNow } from '../../../plugins/iam-harness'

/** Test probe: runs Identity's, Profile's, Authorisation's, Authentication's and the configuration layer's maintenance now, then relays both outboxes, as the timers would. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler(async () => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const identity = await runIdentityMaintenance()
  const profile = iamHarness.profile ? await runProfileMaintenance() : null
  const authorisation = await runAuthorisationMaintenance()
  const authentication = await runAuthenticationMaintenance()
  const configuration = configurationHarness.ready ? await runConfigurationMaintenance() : null
  await relayIdentityNow()
  return { identity, profile, authorisation, authentication, configuration }
})
