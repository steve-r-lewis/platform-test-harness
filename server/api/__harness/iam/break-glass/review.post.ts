import { identitySubjectResolverFromAuthentication, newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../../plugins/authentication-harness'
import { iamHarness } from '../../../../plugins/iam-harness'

const subjects = identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal })

/**
 * Test probe standing in for the host's review procedure: the signed-in
 * operator closes a break-glass review, with the host's attestation of
 * whether they held the passkey (`heldPasskey`). Server-only in a real host.
 * Absent (404) unless HARNESS_TEST_MODE=1.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const subject = await subjects.resolve(event)
  if (!subject) throw createError({ statusCode: 401 })
  const { reviewId, heldPasskey } = await readBody<{ reviewId?: unknown, heldPasskey?: unknown }>(event)
  if (typeof reviewId !== 'string' || typeof heldPasskey !== 'boolean') throw createError({ statusCode: 400 })
  try {
    return await getIdentityBreakGlass().closeReview({ subject, reviewId, outcome: 'reviewed', closerHeldPasskey: heldPasskey, correlationId: newCorrelationId() })
  } catch (error) {
    const code = (error as { code?: string }).code
    throw createError({ statusCode: code === 'conflict' ? 409 : code === 'forbidden' || code === 'insufficient-assurance' ? 403 : 503, data: { code } })
  }
})
