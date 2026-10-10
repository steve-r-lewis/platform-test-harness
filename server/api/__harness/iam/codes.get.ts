import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness } from '../../../plugins/iam-harness'

/** Test probe: verification codes Profile asked the harness to deliver, as a person would read them. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler((event) => {
  if (!harnessTestMode || !iamHarness.profile) throw createError({ statusCode: 404 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return iamHarness.codes
})
