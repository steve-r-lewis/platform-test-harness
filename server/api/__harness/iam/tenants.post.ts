import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness, relayIdentityNow } from '../../../plugins/iam-harness'

/**
 * Test probe standing in for the platform operator's procedure
 * (iam-integration's tenant lifecycle, provisioning): a new tenant in the
 * harness's data region, and its first root group with the given founding
 * owner. Absent (404) unless HARNESS_TEST_MODE=1.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const { ownerId, name } = await readBody<{ ownerId?: unknown, name?: unknown }>(event)
  if (typeof ownerId !== 'string' || typeof name !== 'string') throw createError({ statusCode: 400 })
  const pool = iamHarness.operator
  const { tenantId } = await provisionIdentityTenant({ pool, jurisdiction: 'uk-gdpr', dataRegion: 'uk', correlationId: newCorrelationId() })
  const { groupId } = await bootstrapIdentityRootGroup({ pool, tenantId, name, firstOwnerId: ownerId, correlationId: newCorrelationId() })
  await relayIdentityNow()
  return { tenantId, groupId }
})
