import { harnessTestMode } from '../../plugins/authentication-harness'

/** Test probe: moves the suite's clock forward and answers the new time. Absent (404) unless HARNESS_TEST_MODE=1. */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode) throw createError({ statusCode: 404 })
  const { advanceMs } = await readBody<{ advanceMs?: unknown }>(event)
  if (typeof advanceMs !== 'number' || !Number.isInteger(advanceMs) || advanceMs < 0 || advanceMs > 400 * 86_400_000) throw createError({ statusCode: 400 })
  return { now: advanceHarnessClock(advanceMs).toISOString() }
})
