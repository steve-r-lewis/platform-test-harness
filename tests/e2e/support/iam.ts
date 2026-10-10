import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { enrolAuthenticator, ORIGIN, PASSWORD, signInWithPassword, verifiedAccount } from './authentication'

/**
 * Black-box helpers for the IAM suite's processes: they drive the members
 * only through their HTTP APIs and pages, and the harness only through its
 * test probes (`/api/__harness/*`).
 */
export const headers = { origin: ORIGIN }
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export interface Person {
  page: Page
  context: BrowserContext
  email: string
  principalId: string
  /** Signs out and in again with the passkey: phishing-resistant aal2, authenticated now by the suite's clock. */
  signInWithPasskey(): Promise<void>
  close(): Promise<void>
}

/** The signed-in principal's identifier. */
export async function principalOf(page: Page): Promise<string> {
  const session = await (await page.request.get('/api/authentication/session')).json() as { principal: { principalId: string } | null }
  expect(session.principal).not.toBeNull()
  return session.principal!.principalId
}

/** Signs out, then in with the passkey of this context's virtual authenticator. */
export async function passkeySignIn(page: Page): Promise<void> {
  await page.request.post('/api/authentication/sign-out', { headers })
  await page.goto(`/sign-in?redirect=${encodeURIComponent('/account/groups')}`)
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/account/groups`)
}

/**
 * A new person with a passkey on a virtual authenticator (as for every
 * `critical` change: phishing-resistant aal2 within 15 minutes), signed in
 * with it. Their password and authenticator app remain enrolled.
 */
export async function personWithPasskey(browser: Browser): Promise<Person> {
  const context = await browser.newContext({ baseURL: ORIGIN })
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }
  })
  const email = await verifiedAccount(page)
  await signInWithPassword(page, email)
  await enrolAuthenticator(page)
  await page.goto('/account/security')
  await page.getByLabel('Passkey name (optional)').fill('Harness key')
  await page.getByRole('button', { name: 'Add a passkey' }).click()
  await expect(page.getByRole('button', { name: 'Remove Harness key' })).toBeVisible()
  await passkeySignIn(page)
  const principalId = await principalOf(page)
  return { page, context, email, principalId, signInWithPasskey: () => passkeySignIn(page), close: () => context.close() }
}

/** A new person signed in with their password only (aal1). */
export async function personWithPassword(browser: Browser): Promise<Person & { signInWithPassword(): Promise<number> }> {
  const context = await browser.newContext({ baseURL: ORIGIN })
  const page = await context.newPage()
  const email = await verifiedAccount(page)
  const signIn = async () => (await page.request.post('/api/authentication/sign-in', { data: { email, password: PASSWORD }, headers })).status()
  expect(await signIn()).toBe(200)
  const principalId = await principalOf(page)
  return {
    page,
    context,
    email,
    principalId,
    signInWithPasskey: async () => { throw new Error('No passkey') },
    signInWithPassword: signIn,
    close: () => context.close()
  }
}

/** Relays Identity's and Profile's outboxes now. */
export async function relay(page: Page): Promise<void> {
  expect((await page.request.post('/api/__harness/iam/relay', { headers })).status()).toBe(200)
}

/** Moves the suite's clock forward (every member shares it) and answers the new time. */
export async function advance(page: Page, ms: number): Promise<Date> {
  const response = await page.request.post('/api/__harness/clock', { data: { advanceMs: ms }, headers })
  expect(response.status()).toBe(200)
  return new Date((await response.json()).now)
}

/** The suite's clock now. */
export const clockNow = (page: Page) => advance(page, 0)

/** Runs Identity's and Profile's maintenance, then relays, as the timers would. */
export async function maintain(page: Page): Promise<{ identity: { closedIdentities: number, appliedChanges: number } }> {
  const response = await page.request.post('/api/__harness/iam/maintenance', { headers })
  expect(response.status()).toBe(200)
  return response.json()
}

export async function events(page: Page): Promise<{ type: string, correlationId?: string, data: Record<string, unknown> }[]> {
  return (await page.request.get('/api/__harness/iam/events')).json()
}

/** A child group of `parentGroupId`, created by the signed-in person, who becomes its founding owner. */
export async function createGroup(page: Page, parentGroupId: string, name: string): Promise<string> {
  const created = await page.request.post('/api/identity/groups', { data: { parentGroupId, name }, headers })
  expect(created.status()).toBe(201)
  await relay(page)
  return (await created.json()).groupId
}

/** The person asks to join `groupId`, and `owner` approves. */
export async function join(person: Page, owner: Page, groupId: string): Promise<void> {
  const asked = await person.request.post(`/api/identity/groups/${groupId}/join`, { headers })
  expect(asked.status()).toBe(200)
  const { joinRequestId } = await asked.json()
  expect((await owner.request.post(`/api/identity/join-requests/${joinRequestId}/decision`, { data: { decision: 'approve' }, headers })).status()).toBe(200)
  await relay(owner)
}

interface Membership { membershipId: string, owner: boolean, kind: string, effectiveStatus: string, group: { groupId: string } }

/** The signed-in person's membership in a group, if one is in effect. */
export async function membershipIn(page: Page, groupId: string): Promise<Membership | undefined> {
  const me = await (await page.request.get('/api/identity/me')).json() as { actor: { memberships: Membership[] } }
  return me.actor.memberships.find(m => m.group.groupId === groupId)
}

export const justification = { reasonCode: 'harness-test', reference: null }

export interface Change {
  changeId: string
  state: 'awaiting-approval' | 'delayed' | 'applied' | 'rejected' | 'expired' | 'cancelled'
  route: string
  changeDigest: string
  delayEndsAt: string | null
  requiredApprovals: number
}

/** Requests a governance change; answers the response, whose body is the pending change when it succeeds. */
export function requestChange(page: Page, request: { type: string, target: Record<string, unknown> }, reference: string | null = null) {
  return page.request.post('/api/identity/changes', { data: { request: { ...request, justification: { ...justification, reference } } }, headers })
}

export async function changeOf(page: Page, changeId: string): Promise<Change> {
  return (await page.request.get(`/api/identity/changes/${changeId}`)).json()
}

/** Decides a change, approving the digest shown unless another is given. */
export function decide(page: Page, change: Change, decision: 'approve' | 'reject' = 'approve', changeDigest = change.changeDigest) {
  return page.request.post(`/api/identity/changes/${change.changeId}/decision`, { data: { decision, changeDigest }, headers })
}

/** The latest invitation link the harness delivered to `address`. */
export async function invitationLink(page: Page, address: string): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    const delivered = await (await page.request.get('/api/__harness/iam/invitations')).json() as { address: string, link: string }[]
    link = delivered.filter(d => d.address === address).at(-1)?.link
    return link
  }).toBeTruthy()
  return link!
}

/** The error code of a refused response. */
export async function codeOf(response: { json(): Promise<unknown> }): Promise<string | undefined> {
  const body = await response.json() as { data?: { code?: string } }
  return body.data?.code
}
