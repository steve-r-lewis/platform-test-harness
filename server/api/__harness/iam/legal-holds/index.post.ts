import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../../plugins/authentication-harness'
import { iamHarness } from '../../../../plugins/iam-harness'

const PARTS = ['profile', 'authentication', 'authorisation'] as const
type Part = typeof PARTS[number]

/**
 * Test probe: an operator places a legal hold through Profile's server
 * function, which a real host exposes to no request. Absent (404) unless
 * HARNESS_TEST_MODE=1.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.profile) throw createError({ statusCode: 404 })
  const { identityId, parts, endsAt } = await readBody<{ identityId?: unknown, parts?: unknown, endsAt?: unknown }>(event)
  if (typeof identityId !== 'string' || typeof endsAt !== 'string' || !Array.isArray(parts) || !parts.every(part => (PARTS as readonly unknown[]).includes(part))) {
    throw createError({ statusCode: 400 })
  }
  return placeProfileLegalHold({ identityId, parts: parts as Part[], endsAt, reasonCode: 'litigation', correlationId: newCorrelationId() })
})
