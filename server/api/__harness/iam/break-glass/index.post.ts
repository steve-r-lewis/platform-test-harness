import { newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { harnessTestMode } from '../../../../plugins/authentication-harness'
import { breakGlassEnrolmentLink, deliverBreakGlassLink, iamHarness } from '../../../../plugins/iam-harness'

/**
 * Test probe standing in for the operator's break-glass provisioning
 * (iam-integration's break-glass process): Identity's break-glass identity
 * with the migration pool, then Authentication's passkey-only account, whose
 * one-time enrolment link goes to the operators. Server-only in a real host.
 * Absent (404) unless HARNESS_TEST_MODE=1.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const { address } = await readBody<{ address?: unknown }>(event)
  if (typeof address !== 'string') throw createError({ statusCode: 400 })
  const correlationId = newCorrelationId()
  const { identityId } = await provisionIdentityBreakGlass({ pool: iamHarness.operator, homeTenantId: iamHarness.tenantId!, correlationId })
  const { enrolmentToken } = await provisionAuthenticationBreakGlass({ identityId, address, correlationId })
  deliverBreakGlassLink(identityId, breakGlassEnrolmentLink(enrolmentToken))
  return { identityId }
})
