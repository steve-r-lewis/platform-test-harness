import { harnessTestMode } from '../../../plugins/authentication-harness'
import { iamHarness } from '../../../plugins/iam-harness'

/**
 * Test probe: Identity's record of a deleted group's or closed tenant's
 * disposal (state, and the members that confirmed it), or null. Absent (404)
 * unless HARNESS_TEST_MODE=1; a host shows it to operators only.
 */
export default defineEventHandler(async (event) => {
  if (!harnessTestMode || !iamHarness.operator) throw createError({ statusCode: 404 })
  await iamHarness.ready
  const { kind, id } = getQuery(event)
  if ((kind !== 'group' && kind !== 'tenant') || typeof id !== 'string') throw createError({ statusCode: 400 })
  setResponseHeader(event, 'cache-control', 'no-store')
  return { disposal: await getIdentityDisposal({ kind, id }) }
})
