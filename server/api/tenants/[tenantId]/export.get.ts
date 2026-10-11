import { identitySubjectResolverFromAuthentication, newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { tenantExport } from '../../../plugins/iam-harness'

/** Who is asking, as Identity's own endpoints see them: Authentication's principal through iam-integration's subject adapter. */
const subjects = identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal })

const STATUS: Record<string, number> = { 'validation-failed': 400, 'forbidden': 403, 'insufficient-assurance': 403, 'reauthentication-required': 401, 'conflict': 409 }
const IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The host's governance export endpoint (iam-integration's tenant
 * lifecycle): during a tenant's notice period, an owner of one of its root
 * groups downloads its governance records. Identity decides who may have
 * it; Authorisation's part is asked for only once Identity has agreed. It
 * holds identifiers, codes, dates and group names, never personal data, and
 * nothing keeps it.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const subject = await subjects.resolve(event)
  if (!subject) throw createError({ statusCode: 401, data: { code: 'unauthenticated' } })
  const tenantId = getRouterParam(event, 'tenantId')
  if (!tenantId || !IDENTIFIER.test(tenantId)) throw createError({ statusCode: 400, data: { code: 'validation-failed' } })
  let records
  try {
    records = await (await tenantExport()).exportTenant({ subject, tenantId, correlationId: newCorrelationId() })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code && STATUS[code]) throw createError({ statusCode: STATUS[code], data: { code } })
    console.error('[harness] tenant export failed:', error instanceof Error ? error.name : 'error')
    throw createError({ statusCode: 503, data: { code: 'unavailable' } })
  }
  // Identity answers forbidden for a tenant it does not know; null never reaches here.
  if (!records) throw createError({ statusCode: 403, data: { code: 'forbidden' } })
  return records
})
