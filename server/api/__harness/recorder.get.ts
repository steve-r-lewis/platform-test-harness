import { harnessRecorder, harnessTestMode } from '../../plugins/authentication-harness'

/** Test probe: recorded mail and events. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler((event) => {
  if (!harnessTestMode) throw createError({ statusCode: 404 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return harnessRecorder
})
