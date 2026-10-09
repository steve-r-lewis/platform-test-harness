import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness, relayIdentityNow } from '../../../plugins/iam-harness'

/** Test probe: relays Identity's and Profile's outboxes now, so tests need not wait for the timers. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler(async () => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await relayIdentityNow()
  return { status: 'relayed' }
})
