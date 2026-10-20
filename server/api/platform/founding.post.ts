import { foundPlatform, iamHarness } from '../../plugins/iam-harness'

/**
 * Redeems the operator's founding code (README, "The first super
 * administrator"): the signed-in person, at the policy's second factor,
 * becomes the founding owner of the platform group, and so its super
 * administrator. Coarse answers: a wrong, used or expired code is
 * `forbidden`; once the platform group exists, every attempt is `conflict`.
 */
export default defineEventHandler(async (event) => {
  const origin = process.env.NUXT_IDENTITY_BASE_URL
  if (!origin || getRequestHeader(event, 'origin') !== origin) throw createError({ statusCode: 403, data: { code: 'forbidden' } })
  const principal = await getAuthenticatedPrincipal(event)
  if (!principal) throw createError({ statusCode: 401, data: { code: 'unauthenticated' } })
  // Identity refuses any founding owner but an active person.
  if (principal.kind === 'service') throw createError({ statusCode: 403, data: { code: 'forbidden' } })
  if (principal.assurance.level === 'aal1') throw createError({ statusCode: 403, data: { code: 'insufficient-assurance' } })
  const pool = iamHarness.operator
  if (!pool) throw createError({ statusCode: 503, data: { code: 'unavailable' } })
  await iamHarness.ready
  const body = await readBody<{ code?: unknown }>(event).catch(() => null)
  if (await platformFounded(pool)) throw createError({ statusCode: 409, data: { code: 'conflict' } })
  if (!await redeemPlatformFoundingCode(pool, body?.code)) throw createError({ statusCode: 403, data: { code: 'forbidden' } })
  try {
    return await foundPlatform(principal.principalId)
  } catch (error) {
    // Identity refuses a second root group; anything else leaves the code spent, and the operator issues another.
    console.error('[harness] founding the platform failed:', error instanceof Error ? error.message : 'error')
    throw createError({ statusCode: (error as { code?: string }).code === 'conflict' ? 409 : 503, data: { code: (error as { code?: string }).code === 'conflict' ? 'conflict' : 'unavailable' } })
  }
})
