import { identitySubjectResolverFromAuthentication, newCorrelationId } from '@nuxt4-layers/iam-integration/adapters'
import { invitationSender } from '../../plugins/iam-harness'

interface InvitationBody {
  groupId: string
  kind: 'member' | 'guest'
  address: string
  membershipStartsAt?: string | null
  membershipEndsAt?: string | null
}

const KEYS = new Set(['groupId', 'kind', 'address', 'membershipStartsAt', 'membershipEndsAt'])
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const optionalTime = (value: unknown) => value === undefined || value === null || text(value, 40)

/** A strict body: known keys only, each of its type and length. */
function parse(body: unknown): InvitationBody | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  if (!Object.keys(input).every(key => KEYS.has(key))) return null
  if (!text(input.groupId, 64) || !text(input.address, 320) || (input.kind !== 'member' && input.kind !== 'guest')) return null
  if (!optionalTime(input.membershipStartsAt) || !optionalTime(input.membershipEndsAt)) return null
  return input as unknown as InvitationBody
}

/** Who is asking, as Identity's own endpoints see them: Authentication's principal through iam-integration's subject adapter. */
const subjects = identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal })

const STATUS: Record<string, number> = { 'validation-failed': 400, 'forbidden': 403, 'insufficient-assurance': 403, 'conflict': 409, 'rate-limited': 429 }

/**
 * The host's invitation endpoint (iam-integration's joining-and-leaving
 * process): the signed-in inviter names a group and an address; Identity
 * issues the invitation through iam-integration's invitation sender, and
 * the harness's delivery sends the link. The answer is the same whatever the
 * address, and the address reaches neither Identity nor any log.
 */
export default defineEventHandler(async (event) => {
  // A state-changing request from the host's own origin only, as the members' endpoints require.
  const origin = process.env.NUXT_IDENTITY_BASE_URL
  if (!origin || getRequestHeader(event, 'origin') !== origin) throw createError({ statusCode: 403, data: { code: 'forbidden' } })
  const subject = await subjects.resolve(event)
  if (!subject) throw createError({ statusCode: 401, data: { code: 'unauthenticated' } })
  const body = parse(await readBody(event).catch(() => null))
  if (!body) throw createError({ statusCode: 400, data: { code: 'validation-failed' } })
  let sent
  try {
    sent = await (await invitationSender()).send({ subject, ...body, correlationId: newCorrelationId() })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code && STATUS[code]) throw createError({ statusCode: STATUS[code], data: { code } })
    console.error('[harness] invitation failed:', error instanceof Error ? error.name : 'error')
    throw createError({ statusCode: 503, data: { code: 'unavailable' } })
  }
  setResponseStatus(event, 201)
  return sent
})
