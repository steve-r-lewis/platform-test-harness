import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness } from '../../../plugins/iam-harness'

/** Test probe: Identity's, Profile's, Authorisation's and the configuration layer's events as relayed (opaque identifiers only). Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler((event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return iamHarness.events
})
