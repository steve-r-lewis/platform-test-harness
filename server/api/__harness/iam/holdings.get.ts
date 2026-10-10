import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness } from '../../../plugins/iam-harness'

/**
 * Test probe: what each member still holds for an identity, through each
 * member's own server-only export (null when it holds nothing). Absent (404)
 * unless HARNESS_TEST_MODE=1.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const { identityId } = getQuery(event)
  if (typeof identityId !== 'string') throw createError({ statusCode: 400 })
  const correlationId = newCorrelationId()
  setResponseHeader(event, 'cache-control', 'no-store')
  return {
    identity: await exportIdentityData({ identityId, correlationId }),
    authentication: await exportAuthenticationData({ principalId: identityId, correlationId }),
    authorisation: await exportAuthorisationData({ principalId: identityId, correlationId }),
    profile: iamHarness.profile ? await exportProfileData({ subjectId: identityId }) : null
  }
})
