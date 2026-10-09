import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness, relayIdentityNow } from '../../../plugins/iam-harness'

/** Test probe: relays Identity's outbox now, so tests need not wait for the timer. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler(async () => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await relayIdentityNow()
  return { status: 'relayed' }
})
