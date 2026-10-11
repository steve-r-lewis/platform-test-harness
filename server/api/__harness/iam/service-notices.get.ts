import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness } from '../../../plugins/iam-harness'

/** Test probe: the service-credential notices the harness delivered to owning groups' owners. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler((event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return iamHarness.serviceNotices
})
