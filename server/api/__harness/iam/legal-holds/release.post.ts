import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../../plugins/authentication-harness'
import { iamHarness, relayIdentityNow } from '../../../../plugins/iam-harness'

/** Test probe: an operator releases a legal hold through Profile's server function, then the outboxes are relayed. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.profile) throw createError({ statusCode: 404 })
  const { holdId } = await readBody<{ holdId?: unknown }>(event)
  if (typeof holdId !== 'string') throw createError({ statusCode: 400 })
  await releaseProfileLegalHold({ holdId, reasonCode: 'case-closed', correlationId: newCorrelationId() })
  await relayIdentityNow()
  return { status: 'released' }
})
