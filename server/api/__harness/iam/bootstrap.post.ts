import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../plugins/authentication-harness'
import { applyIdentityPolicy, iamHarness, relayIdentityNow } from '../../../plugins/iam-harness'

/**
 * Test probe standing in for the platform operator's procedure: makes the
 * given identity the founding owner of the tenant's first root group, the
 * platform group. Absent (404) unless HARNESS_TEST_MODE=1; refused once a
 * root group exists, as Identity refuses it.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const { ownerId } = await readBody<{ ownerId?: string }>(event)
  if (typeof ownerId !== 'string') throw createError({ statusCode: 400 })
  const { groupId } = await bootstrapIdentityRootGroup({ pool: iamHarness.operator, tenantId: iamHarness.tenantId!, name: 'Platform', firstOwnerId: ownerId, correlationId: newCorrelationId() })
  iamHarness.platformGroupId = groupId
  applyIdentityPolicy()
  await relayIdentityNow()
  return { groupId }
})
