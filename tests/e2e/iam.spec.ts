import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { lastLink, ORIGIN, PASSWORD, recorder, verifiedAccount } from './support/authentication'
import type { Change, Person } from './support/iam'
import { advance, changeOf, clockNow, createGroup, DAY, decide, events, HOUR, invitationLink, join, maintain, membershipIn, personWithPasskey, requestChange } from './support/iam'

/**
 * The IAM suite composed: Identity, Authentication and Authorisation,
 * connected only through @nuxt4-layers/iam-integration's adapters
 * (server/plugins/iam-harness.ts). These follow iam-integration's processes
 * across the members' boundaries; each member's own behaviour is tested in
 * its repository.
 */

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const headers = { origin: ORIGIN }

/** A new, verified account, signed in with its password through the API. */
async function signedIn(page: Page): Promise<{ email: string, principalId: string }> {
  const email = await verifiedAccount(page)
  const signIn = await page.request.post('/api/authentication/sign-in', { data: { email, password: PASSWORD }, headers })
  expect(signIn.status()).toBe(200)
  const { principal } = await (await page.request.get('/api/authentication/session')).json()
  return { email, principalId: principal.principalId }
}

const relay = (page: Page) => page.request.post('/api/__harness/iam/relay', { headers })

async function anotherPerson(browser: Browser) {
  const context = await browser.newContext({ baseURL: ORIGIN })
  const page = await context.newPage()
  return { page, ...(await signedIn(page)), close: () => context.close() }
}

test.describe.serial('IAM suite', () => {
  /** The platform group's founding owner, with a passkey for `critical` decisions. */
  let owner: Person
  let ownerPage: Page
  let platformGroupId: string

  test('provisioning: Identity issues the account\'s identifier and confirms it once the address is verified', async ({ browser }) => {
    owner = await personWithPasskey(browser)
    ownerPage = owner.page
    const { principalId } = owner
    expect(principalId).toMatch(UUID_V7)
    const session = await (await ownerPage.request.get('/api/authentication/session')).json()
    expect(session.principal.standing).toBe('allowed')
    const me = await ownerPage.request.get('/api/identity/me')
    expect(me.status()).toBe(200)
    const self = await me.json()
    expect(self.actor).toMatchObject({ identityId: principalId, identityState: 'active' })
    expect(self.actor.personalGroup.groupId).toMatch(UUID_V7)
  })

  test('group lifecycle: Authorisation decides Identity\'s permissions from roles that follow Identity\'s owners', async ({ browser }) => {
    const { principal } = await (await ownerPage.request.get('/api/authentication/session')).json()
    const bootstrap = await ownerPage.request.post('/api/__harness/iam/bootstrap', { data: { ownerId: principal.principalId }, headers })
    expect(bootstrap.status()).toBe(200)
    platformGroupId = (await bootstrap.json()).groupId

    // The founding owner holds `owner` in Authorisation, applied from Identity's events.
    expect((await ownerPage.request.get(`/api/identity/groups/${platformGroupId}`)).status()).toBe(200)

    const outsider = await anotherPerson(browser)
    try {
      const refused = await outsider.page.request.get(`/api/identity/groups/${platformGroupId}`)
      expect(refused.status()).toBe(403)
      expect((await refused.json()).data).toEqual({ code: 'forbidden', messageKey: 'identity.error.forbidden' })
    } finally {
      await outsider.close()
    }

    const created = await ownerPage.request.post('/api/identity/groups', { data: { parentGroupId: platformGroupId, name: 'Harness Team' }, headers })
    expect(created.status()).toBe(201)
    const { groupId } = await created.json()
    await relay(ownerPage)
    expect((await ownerPage.request.get(`/api/identity/groups/${groupId}`)).status()).toBe(200)
  })

  test('Identity\'s group page renders through the composed members and meets WCAG 2.2 AA', async () => {
    await ownerPage.goto(`/groups/${platformGroupId}`)
    await expect(ownerPage.getByRole('heading', { level: 2, name: 'Platform' })).toBeVisible()
    await expect(ownerPage.getByRole('heading', { name: 'Safety periods' })).toBeVisible()
    const results = await new AxeBuilder({ page: ownerPage }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  test('paused membership: Authorisation lets the member view the group but not change it', async ({ browser }) => {
    const member = await anotherPerson(browser)
    try {
      // The person asks to join the platform group, and its owner approves.
      const asked = await member.page.request.post(`/api/identity/groups/${platformGroupId}/join`, { headers })
      expect(asked.status()).toBe(200)
      const { joinRequestId } = await asked.json()
      expect((await ownerPage.request.post(`/api/identity/join-requests/${joinRequestId}/decision`, { data: { decision: 'approve' }, headers })).status()).toBe(200)
      await relay(ownerPage)

      const createChild = (name: string) => member.page.request.post('/api/identity/groups', { data: { parentGroupId: platformGroupId, name }, headers })
      const viewGroup = () => member.page.request.get(`/api/identity/groups/${platformGroupId}`)
      expect((await viewGroup()).status()).toBe(200)
      expect((await createChild('Before Pause')).status()).toBe(201)

      const me = await (await member.page.request.get('/api/identity/me')).json() as { actor: { memberships: { membershipId: string, group: { groupId: string } }[] } }
      const { membershipId } = me.actor.memberships.find(m => m.group.groupId === platformGroupId)!
      expect((await member.page.request.post(`/api/identity/memberships/${membershipId}/pause`, { headers })).status()).toBe(200)

      // Viewing (identity.groups:view and identity.memberships:view, low-risk views) still works; creating a child group, a change, does not.
      expect((await viewGroup()).status()).toBe(200)
      expect((await member.page.request.get(`/api/identity/groups/${platformGroupId}/members`)).status()).toBe(200)
      const refused = await createChild('While Paused')
      expect(refused.status()).toBe(403)
      expect((await refused.json()).data).toEqual({ code: 'forbidden', messageKey: 'identity.error.forbidden' })

      expect((await member.page.request.post(`/api/identity/memberships/${membershipId}/resume`, { headers })).status()).toBe(200)
      expect((await createChild('After Resume')).status()).toBe(201)

      await relay(ownerPage)
      const events = await (await ownerPage.request.get('/api/__harness/iam/events')).json() as { type: string }[]
      expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['membership.paused', 'membership.resumed']))
    } finally {
      await member.close()
    }
  })

  test('profile: a fellow member sees the name a person chose; an outsider does not', async ({ browser }) => {
    // The owner sets their name; Profile has their record since provisioning.
    const own = await (await ownerPage.request.get('/api/profile/me')).json() as { version: number }
    expect(own.version).toBeGreaterThan(0)
    const named = await ownerPage.request.patch('/api/profile/me', { data: { expectedVersion: own.version, changes: { name: 'Ada Harness' } }, headers })
    expect(named.status()).toBe(200)
    // Another tab still holding the old version is refused.
    const stale = await ownerPage.request.patch('/api/profile/me', { data: { expectedVersion: own.version, changes: { name: 'Someone Else' } }, headers })
    expect(stale.status()).toBe(409)
    const ownerId = (await (await ownerPage.request.get('/api/authentication/session')).json()).principal.principalId as string

    const member = await anotherPerson(browser)
    const outsider = await anotherPerson(browser)
    try {
      const asked = await member.page.request.post(`/api/identity/groups/${platformGroupId}/join`, { headers })
      const { joinRequestId } = await asked.json()
      expect((await ownerPage.request.post(`/api/identity/join-requests/${joinRequestId}/decision`, { data: { decision: 'approve' }, headers })).status()).toBe(200)
      await relay(ownerPage)

      // Through Profile's API: the name to a fellow member, nothing to an outsider.
      const seen = await (await member.page.request.get(`/api/profile/people/${ownerId}?groupId=${platformGroupId}`)).json()
      expect(seen).toEqual({ subjectId: ownerId, displayName: { kind: 'name', value: 'Ada Harness' }, attributes: { name: 'Ada Harness' } })
      const hidden = await (await outsider.page.request.post('/api/profile/display-names', { data: { subjectIds: [ownerId], purpose: 'listing' }, headers })).json()
      expect(hidden).toEqual([{ subjectId: ownerId, displayName: { kind: 'hidden' } }])

      // On Identity's group page, through the host's IdentityPersonName: the member sees the owner's name.
      await member.page.goto(`/groups/${platformGroupId}`)
      await expect(member.page.locator(`[data-identity-id="${ownerId}"]`).first()).toHaveText('Ada Harness')
      // The member set no name: Profile shows the neutral fallback.
      await expect(member.page.locator(`[data-identity-id="${member.principalId}"]`).first()).toHaveText('Member')

      // Profile's own pages: the member sees the owner's profile as disclosed to them, never more.
      await member.page.goto(`/profile/people/${ownerId}?groupId=${platformGroupId}`)
      await expect(member.page.getByRole('heading', { level: 1, name: 'Ada Harness' })).toBeVisible()
      await expect(member.page).toHaveTitle('Profile')
      await outsider.page.goto(`/profile/people/${ownerId}`)
      await expect(outsider.page.getByText('This profile is not available to you.')).toBeVisible()
      // The owner's own page shows what they set, and nothing Authentication holds.
      await ownerPage.goto('/profile')
      const details = ownerPage.getByRole('region', { name: 'Your details', exact: true })
      await expect(details.getByLabel('Full name')).toHaveValue('Ada Harness')
      await expect(details.getByLabel('Contact email')).toHaveValue('')

      // Profile's events carry identifiers and attribute names, never the name itself.
      await relay(ownerPage)
      const events = await (await ownerPage.request.get('/api/__harness/iam/events')).json() as { type: string, data: Record<string, unknown> }[]
      expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['profile.created', 'profile.changed']))
      expect(events.find(e => e.type === 'profile.changed' && e.data.identityId === ownerId)?.data).toEqual({ identityId: ownerId, attributes: ['name'], disclosure: false })
      expect(JSON.stringify(events)).not.toContain('Ada Harness')
    } finally {
      await member.close()
      await outsider.close()
    }
  })

  test('data-subject access: Profile gathers every member\'s part into one archive, for the person only', async ({ browser }) => {
    const member = await anotherPerson(browser)
    const outsider = await anotherPerson(browser)
    try {
      const asked = await member.page.request.post(`/api/identity/groups/${platformGroupId}/join`, { headers })
      const { joinRequestId } = await asked.json()
      expect((await ownerPage.request.post(`/api/identity/join-requests/${joinRequestId}/decision`, { data: { decision: 'approve' }, headers })).status()).toBe(200)
      await relay(ownerPage)

      const opened = await member.page.request.post('/api/profile/me/requests', { data: { type: 'access' }, headers })
      expect(opened.status()).toBe(201)
      const request = await opened.json() as { requestId: string, status: string, parts: { part: string, status: string }[] }
      expect(request.status).toBe('completed')
      expect(request.parts.map(part => `${part.part}:${part.status}`)).toEqual(['profile:done', 'identity:done', 'authentication:done', 'authorisation:done'])

      const archive = await member.page.request.get(`/api/profile/me/requests/${request.requestId}/archive`)
      expect(archive.status()).toBe(200)
      expect(archive.headers()['cache-control']).toBe('no-store')
      const { parts } = await archive.json() as {
        parts: {
          profile: { settings: unknown }
          identity: { identity: { identityId: string }, memberships: { groupId: string }[] }
          authentication: { signInIdentifiers: unknown[], password: unknown }
          authorisation: { roleAssignments: unknown[] }
        }
      }
      // Each member answers for what it holds, through iam-integration's coordinator.
      expect(parts.identity.identity.identityId).toBe(member.principalId)
      expect(parts.identity.memberships.map(m => m.groupId)).toContain(platformGroupId)
      expect(parts.authentication.signInIdentifiers).toEqual([expect.objectContaining({ kind: 'email', value: member.email, verified: true })])
      expect(parts.authentication.password).toEqual({ set: true })
      expect(parts.authorisation.roleAssignments).toEqual(expect.arrayContaining([expect.objectContaining({ principalId: member.principalId, groupId: platformGroupId })]))
      expect(parts.profile.settings).toBeTruthy()
      // Nothing that would let anyone sign in as the person, and nobody else's address.
      const text = JSON.stringify(parts)
      expect(text).not.toMatch(/token|secret|\$argon|scrypt|ipAddress/i)
      expect(text).not.toContain(outsider.email)

      expect((await outsider.page.request.get(`/api/profile/me/requests/${request.requestId}/archive`)).status()).toBe(403)
      await relay(ownerPage)
      const events = await (await ownerPage.request.get('/api/__harness/iam/events')).json() as { type: string, data: Record<string, unknown> }[]
      expect(events.filter(e => e.type === 'profile.request-completed').map(e => e.data.requestId)).toContain(request.requestId)
      expect(JSON.stringify(events)).not.toContain(member.email)
    } finally {
      await member.close()
      await outsider.close()
    }
  })

  test('contact verification: Profile sends a code through the host, and the detail is verified until it changes', async ({ browser }) => {
    const person = await anotherPerson(browser)
    try {
      const own = await (await person.page.request.get('/api/profile/me')).json() as { version: number }
      const saved = await person.page.request.patch('/api/profile/me', { data: { expectedVersion: own.version, changes: { email: 'contact@example.org' } }, headers })
      expect(saved.status()).toBe(200)
      const sent = await person.page.request.post('/api/profile/me/verification/email/send', { headers })
      expect(await sent.json()).toMatchObject({ attribute: 'email', status: 'sent' })
      const codes = await (await person.page.request.get('/api/__harness/iam/codes')).json() as { attribute: string, code: string }[]
      const confirmed = await person.page.request.post('/api/profile/me/verification/email/confirm', { data: { code: codes.at(-1)!.code }, headers })
      expect(confirmed.status()).toBe(200)
      expect((await confirmed.json()).attributes).toMatchObject({ email: 'contact@example.org', email_verified: true })
    } finally {
      await person.close()
    }
  })

  test('leaving a group: Profile lists it under Identity\'s name, and the person may be anonymous there', async ({ browser }) => {
    const leaver = await anotherPerson(browser)
    try {
      const asked = await leaver.page.request.post(`/api/identity/groups/${platformGroupId}/join`, { headers })
      const { joinRequestId } = await asked.json()
      expect((await ownerPage.request.post(`/api/identity/join-requests/${joinRequestId}/decision`, { data: { decision: 'approve' }, headers })).status()).toBe(200)
      await relay(ownerPage)
      const me = await (await leaver.page.request.get('/api/identity/me')).json() as { actor: { memberships: { membershipId: string, group: { groupId: string } }[] } }
      const { membershipId } = me.actor.memberships.find(m => m.group.groupId === platformGroupId)!
      expect((await leaver.page.request.post(`/api/identity/memberships/${membershipId}/leave`, { headers })).status()).toBe(200)
      await relay(ownerPage)

      // Identity names the group the person left; the host's ProfileGroupName shows it on Profile's page.
      const self = await (await leaver.page.request.get('/api/identity/me')).json() as { formerGroupNames: { groupId: string, name: string }[] }
      const formerName = self.formerGroupNames.find(group => group.groupId === platformGroupId)!.name
      await leaver.page.goto('/profile/departures')
      await expect(leaver.page.locator(`[data-group-id="${platformGroupId}"]`)).toHaveText(formerName)
      const results = await new AxeBuilder({ page: leaver.page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(results.violations.map(v => v.id)).toEqual([])

      await leaver.page.getByRole('button', { name: 'Show me as "Former member" here' }).click()
      await leaver.page.getByRole('button', { name: 'Yes, show me as "Former member"' }).click()
      await expect(leaver.page.getByText('Shown as "Former member"', { exact: true })).toBeVisible()
      // The group's members now see "Former member" for them, whatever the group's policy.
      const names = await (await ownerPage.request.post('/api/profile/display-names', { data: { subjectIds: [leaver.principalId], groupId: platformGroupId, purpose: 'attribution' }, headers })).json()
      expect(names).toEqual([{ subjectId: leaver.principalId, displayName: { kind: 'former-member' } }])
    } finally {
      await leaver.close()
    }
  })

  test('pausing: Identity\'s pause ends the person\'s sessions, and they return only to resume', async ({ browser }) => {
    const person = await anotherPerson(browser)
    try {
      const paused = await person.page.request.post('/api/identity/me/pause', { headers })
      expect(paused.status()).toBe(200)
      await relay(person.page)
      expect((await (await person.page.request.get('/api/authentication/session')).json()).principal).toBeNull()

      const again = await person.page.request.post('/api/authentication/sign-in', { data: { email: person.email, password: PASSWORD }, headers })
      expect(again.status()).toBe(200)
      expect((await (await person.page.request.get('/api/authentication/session')).json()).principal.standing).toBe('resume-only')

      expect((await person.page.request.post('/api/identity/me/resume', { headers })).status()).toBe(200)
      expect((await (await person.page.request.get('/api/authentication/session')).json()).principal.standing).toBe('allowed')
    } finally {
      await person.close()
    }
  })

  test('events carry opaque identifiers only', async () => {
    const events = await (await ownerPage.request.get('/api/__harness/iam/events')).json() as { type: string }[]
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['identity.provisioned', 'group.created', 'membership.added', 'identity.paused']))
    expect(JSON.stringify(events)).not.toMatch(/@example\.com|Harness Team/)
  })

  // ---------------------------------------------------------------------------
  // Joining and leaving (iam-integration docs/processes/joining-and-leaving.md)
  // ---------------------------------------------------------------------------

  test('joining: an invitation answers alike for any address, admits its holder once, and admits nobody once revoked or expired', async ({ browser }) => {
    const team = await createGroup(ownerPage, platformGroupId, 'Invited Team')
    const invitee = await anotherPerson(browser)
    const other = await anotherPerson(browser)
    try {
      const invite = (address: string) => ownerPage.request.post('/api/invitations', { data: { groupId: team, kind: 'member', address }, headers })
      // A known address and an unknown one: the same answer, and the address reaches no member.
      const known = await invite(invitee.email)
      const unknown = await invite(`nobody.${Date.now()}@example.com`)
      expect([known.status(), unknown.status()]).toEqual([201, 201])
      const [a, b] = [await known.json(), await unknown.json()]
      expect(Object.keys(a).sort()).toEqual(['expiresAt', 'invitationId', 'requiresConfirmation'])
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort())
      expect(b.requiresConfirmation).toBe(a.requiresConfirmation)

      // The link carries the token in its fragment; the invitee accepts on Identity's page.
      const link = await invitationLink(ownerPage, invitee.email)
      const token = new URL(link).hash.slice(1)
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      await invitee.page.goto(link)
      await invitee.page.getByRole('button', { name: 'Accept invitation' }).click()
      await expect(invitee.page.getByText('Thank you. If the invitation was still open')).toBeVisible()
      await relay(ownerPage)
      expect((await invitee.page.request.get(`/api/identity/groups/${team}`)).status()).toBe(200)

      // Used: the same token admits nobody else, and the answer is the same.
      const accept = (t: string) => other.page.request.post('/api/identity/invitations/accept', { data: { token: t }, headers })
      const reused = await accept(token)
      expect(reused.status()).toBe(200)
      expect(await reused.json()).toEqual({ status: 'accepted' })
      const viewAsOther = () => other.page.request.get(`/api/identity/groups/${team}`)
      expect((await viewAsOther()).status()).toBe(403)

      // Revoked.
      const revokedAddress = `revoked.${Date.now()}@example.com`
      const revoked = await (await invite(revokedAddress)).json()
      expect((await ownerPage.request.post(`/api/identity/invitations/${revoked.invitationId}/revoke`, { headers })).status()).toBe(200)
      expect(await (await accept(new URL(await invitationLink(ownerPage, revokedAddress)).hash.slice(1))).json()).toEqual({ status: 'accepted' })
      expect((await viewAsOther()).status()).toBe(403)

      // Expired: 14 days by default, by the suite's clock.
      const expiredAddress = `expired.${Date.now()}@example.com`
      expect((await invite(expiredAddress)).status()).toBe(201)
      await advance(ownerPage, 15 * DAY)
      expect(await (await accept(new URL(await invitationLink(ownerPage, expiredAddress)).hash.slice(1))).json()).toEqual({ status: 'accepted' })
      await relay(ownerPage)
      expect((await viewAsOther()).status()).toBe(403)

      // Neither the address nor the token reaches any event.
      expect(JSON.stringify(await events(ownerPage))).not.toMatch(new RegExp(`${token}|${invitee.email.replace(/\./g, '\\.')}`))
    } finally {
      await invitee.close()
      await other.close()
    }
  })

  test('joining: a forwarded guest invitation confers nothing until an administrator confirms who accepted', async ({ browser }) => {
    const team = await createGroup(ownerPage, platformGroupId, 'Guest Team')
    const forwardedTo = await anotherPerson(browser)
    const confirmed = await anotherPerson(browser)
    try {
      const inviteGuest = async (address: string) => {
        const response = await ownerPage.request.post('/api/invitations', { data: { groupId: team, kind: 'guest', address }, headers })
        expect(response.status()).toBe(201)
        const sent = await response.json()
        expect(sent.requiresConfirmation).toBe(true)
        return { ...sent, token: new URL(await invitationLink(ownerPage, address)).hash.slice(1) as string }
      }
      // The inviter cannot accept their own unbound invitation.
      const own = await inviteGuest(`own.${Date.now()}@example.com`)
      await ownerPage.request.post('/api/identity/invitations/accept', { data: { token: own.token }, headers })
      const listed = async (id: string) => ((await (await ownerPage.request.get(`/api/identity/groups/${team}/invitations`)).json()) as { invitationId: string, state: string }[]).find(i => i.invitationId === id)
      expect((await listed(own.invitationId))?.state).toBe('open')

      // Someone the link was forwarded to accepts: no membership until confirmed, and refusal creates none.
      const forwarded = await inviteGuest(`forwarded.${Date.now()}@example.com`)
      await forwardedTo.page.request.post('/api/identity/invitations/accept', { data: { token: forwarded.token }, headers })
      await relay(ownerPage)
      expect((await listed(forwarded.invitationId))?.state).toBe('awaiting-confirmation')
      expect(await membershipIn(forwardedTo.page, team)).toBeUndefined()
      // The person who accepted cannot confirm themselves.
      expect((await forwardedTo.page.request.post(`/api/identity/invitations/${forwarded.invitationId}/decision`, { data: { decision: 'confirm' }, headers })).status()).toBe(403)
      expect((await ownerPage.request.post(`/api/identity/invitations/${forwarded.invitationId}/decision`, { data: { decision: 'refuse' }, headers })).status()).toBe(200)
      await relay(ownerPage)
      expect(await membershipIn(forwardedTo.page, team)).toBeUndefined()

      // Confirmed: a guest membership.
      const second = await inviteGuest(`confirmed.${Date.now()}@example.com`)
      await confirmed.page.request.post('/api/identity/invitations/accept', { data: { token: second.token }, headers })
      expect((await ownerPage.request.post(`/api/identity/invitations/${second.invitationId}/decision`, { data: { decision: 'confirm' }, headers })).status()).toBe(200)
      await relay(ownerPage)
      expect(await membershipIn(confirmed.page, team)).toMatchObject({ kind: 'guest', effectiveStatus: 'active' })
    } finally {
      await forwardedTo.close()
      await confirmed.close()
    }
  })

  test('joining: a membership past its end date confers nothing, even before Identity records it ended', async ({ browser }) => {
    const team = await createGroup(ownerPage, platformGroupId, 'Fixed Term Team')
    const contractor = await anotherPerson(browser)
    try {
      const endsAt = new Date((await clockNow(ownerPage)).getTime() + HOUR).toISOString()
      const sent = await ownerPage.request.post('/api/invitations', { data: { groupId: team, kind: 'member', address: contractor.email, membershipEndsAt: endsAt }, headers })
      expect(sent.status()).toBe(201)
      const token = new URL(await invitationLink(ownerPage, contractor.email)).hash.slice(1)
      await contractor.page.request.post('/api/identity/invitations/accept', { data: { token }, headers })
      await relay(ownerPage)
      const view = () => contractor.page.request.get(`/api/identity/groups/${team}`)
      expect((await view()).status()).toBe(200)
      // No maintenance runs: the end date alone stops the membership conferring anything.
      await advance(ownerPage, 2 * HOUR)
      expect((await view()).status()).toBe(403)
      expect(await membershipIn(contractor.page, team)).toBeUndefined()
    } finally {
      await contractor.close()
    }
  })

  test('leaving: the personal group and the last owner cannot leave; a leaver loses access at once', async ({ browser }) => {
    const team = await createGroup(ownerPage, platformGroupId, 'Leaving Team')
    const leaver = await anotherPerson(browser)
    try {
      // The last owner cannot leave.
      const ownMembership = (await membershipIn(ownerPage, team))!
      expect(ownMembership.owner).toBe(true)
      const lastOwner = await ownerPage.request.post(`/api/identity/memberships/${ownMembership.membershipId}/leave`, { headers })
      expect(lastOwner.status()).toBe(409)

      // Nobody leaves their personal group: it is not a membership one can name.
      const me = await (await leaver.page.request.get('/api/identity/me')).json() as { actor: { personalGroup: { groupId: string } } }
      expect((await leaver.page.request.post(`/api/identity/memberships/${me.actor.personalGroup.groupId}/leave`, { headers })).status()).toBe(403)

      await join(leaver.page, ownerPage, team)
      const view = () => leaver.page.request.get(`/api/identity/groups/${team}/members`)
      expect((await view()).status()).toBe(200)
      const { membershipId } = (await membershipIn(leaver.page, team))!
      expect((await leaver.page.request.post(`/api/identity/memberships/${membershipId}/leave`, { headers })).status()).toBe(200)
      // Low-risk reads within the bounded consistency period; here at once.
      await expect.poll(async () => (await view()).status()).toBe(403)
      // A medium-risk change (a child group) is refused at once.
      expect((await leaver.page.request.post('/api/identity/groups', { data: { parentGroupId: team, name: 'After Leaving' }, headers })).status()).toBe(403)
      await relay(ownerPage)
      expect((await events(ownerPage)).some(e => e.type === 'membership.ended' && e.data.membershipId === membershipId)).toBe(true)
    } finally {
      await leaver.close()
    }
  })

  // ---------------------------------------------------------------------------
  // Approvals (iam-integration docs/processes/approvals.md)
  // ---------------------------------------------------------------------------

  let requester: Person
  let approver: Person
  let governed: string

  test('approvals: with no other approver in the group, one owner of the parent group approves; nobody approves their own or a changed change', async ({ browser }) => {
    requester = await personWithPasskey(browser)
    approver = await personWithPasskey(browser)
    await join(requester.page, ownerPage, platformGroupId)
    governed = await createGroup(requester.page, platformGroupId, 'Governed Team')
    await join(approver.page, requester.page, governed)
    const { membershipId } = (await membershipIn(approver.page, governed))!

    const response = await requestChange(requester.page, { type: 'group.add-owner', target: { membershipId } })
    expect(response.status()).toBe(201)
    const change = await response.json() as Change
    expect(change).toMatchObject({ state: 'awaiting-approval', route: 'parent-owner', requiredApprovals: 1 })

    // Not the requester, not the beneficiary, and only the exact change.
    expect((await decide(requester.page, change)).status()).toBe(409)
    expect((await decide(approver.page, change)).status()).toBe(409)
    await owner.signInWithPasskey()
    expect((await decide(ownerPage, change, 'approve', '0'.repeat(64))).status()).toBe(409)
    expect((await changeOf(requester.page, change.changeId)).state).toBe('awaiting-approval')

    const approved = await decide(ownerPage, change)
    expect(approved.status()).toBe(200)
    expect((await approved.json()).state).toBe('applied')
    await relay(ownerPage)
    expect((await membershipIn(approver.page, governed))?.owner).toBe(true)
    const decided = (await events(ownerPage)).filter(e => e.data.changeId === change.changeId).map(e => e.type)
    expect(decided).toEqual(expect.arrayContaining(['approval.requested', 'approval.decided', 'group.owners-changed']))
  })

  test('approvals: an approver whose qualifying role was removed after the request is refused', async ({ browser }) => {
    const beneficiary = await anotherPerson(browser)
    try {
      await join(beneficiary.page, requester.page, governed)
      const { membershipId } = (await membershipIn(beneficiary.page, governed))!
      const pending = await (await requestChange(requester.page, { type: 'group.add-owner', target: { membershipId } })).json() as Change
      expect(pending.route).toBe('approvers')

      // The approver stops being an owner before deciding: Authorisation no longer qualifies them.
      const demotion = await (await requestChange(requester.page, { type: 'group.remove-owner', target: { membershipId: (await membershipIn(approver.page, governed))!.membershipId } })).json() as Change
      await owner.signInWithPasskey()
      expect((await decide(ownerPage, demotion)).status()).toBe(200)
      await relay(ownerPage)

      await approver.signInWithPasskey()
      expect((await decide(approver.page, pending)).status()).toBe(403)
      expect((await changeOf(requester.page, pending.changeId)).state).toBe('awaiting-approval')
      expect((await requester.page.request.post(`/api/identity/changes/${pending.changeId}/cancel`, { headers })).status()).toBe(200)
      expect((await changeOf(requester.page, pending.changeId)).state).toBe('cancelled')
    } finally {
      await beneficiary.close()
    }
  })

  test('approvals: a group may raise its requirement but never lower it below the default, and one owner of the parent group still meets it', async ({ browser }) => {
    const raised = { required: { low: 0, medium: 0, high: 1, critical: 2 }, referenceRequired: false }
    await requester.signInWithPasskey()
    const raise = await (await requestChange(requester.page, { type: 'group.change-approvals', target: { groupId: governed, approvals: raised } })).json() as Change
    await owner.signInWithPasskey()
    expect((await decide(ownerPage, raise)).status()).toBe(200)
    const group = await (await requester.page.request.get(`/api/identity/groups/${governed}`)).json() as { group: { settings: { approvals: unknown } } }
    expect(group.group.settings.approvals).toEqual(raised)

    const lowered = await requestChange(requester.page, { type: 'group.change-approvals', target: { groupId: governed, approvals: { required: { low: 0, medium: 0, high: 0, critical: 1 }, referenceRequired: false } } })
    expect(lowered.status()).toBe(400)

    // Two approvers required, none in the group: the parent group's owner alone approves.
    // The new owner needs aal2 for the group's high-risk settings.
    const newcomer = await personWithPasskey(browser)
    try {
      await join(newcomer.page, requester.page, governed)
      const add = await (await requestChange(requester.page, { type: 'group.add-owner', target: { membershipId: (await membershipIn(newcomer.page, governed))!.membershipId } })).json() as Change
      expect(add.route).toBe('parent-owner')
      expect((await decide(ownerPage, add)).status()).toBe(200)
      expect((await changeOf(requester.page, add.changeId)).state).toBe('applied')
      await relay(ownerPage)
      expect((await membershipIn(newcomer.page, governed))?.owner).toBe(true)

      // A leaver loses a high-risk permission at once: the new owner may change the group's settings, then leaves and may not.
      const settings = async () => {
        const view = await (await requester.page.request.get(`/api/identity/groups/${governed}`)).json() as { group: { settings: Record<string, unknown> } }
        const { approvals: _approvals, ...rest } = view.group.settings
        return rest
      }
      const changeSettings = async () => requestChange(newcomer.page, { type: 'group.change-settings', target: { groupId: governed, settings: await settings() } })
      expect((await changeSettings()).status()).not.toBe(403)
      // Another owner remains, so the newcomer may leave.
      const { membershipId } = (await membershipIn(newcomer.page, governed))!
      expect((await newcomer.page.request.post(`/api/identity/memberships/${membershipId}/leave`, { headers })).status()).toBe(200)
      expect((await changeSettings()).status()).toBe(403)
    } finally {
      await newcomer.close()
    }
  })

  test('approvals: nobody grants themselves anything outside their personal group', async () => {
    const { membershipId } = (await membershipIn(requester.page, governed))!
    const now = await clockNow(requester.page)
    const selfGrant = await requestChange(requester.page, { type: 'membership.schedule', target: { membershipId, startsAt: now.toISOString(), endsAt: null } })
    expect(selfGrant.status()).toBe(409)
  })

  let delayedRoot: string

  test('approvals: a change nobody can approve waits out the published delay and can be cancelled meanwhile', async () => {
    const platform = await (await ownerPage.request.get(`/api/identity/groups/${platformGroupId}`)).json() as { group: { tenantId: string } }
    await owner.signInWithPasskey()
    // A root group for the requester, decided in the platform group, whose sole owner is asking: a published delay (high: 72 hours).
    const createRoot = await requestChange(ownerPage, { type: 'group.create-root', target: { tenantId: platform.group.tenantId, name: 'Delayed Root', firstOwnerId: requester.principalId } })
    expect(createRoot.status()).toBe(201)
    const root = await createRoot.json() as Change & { createdId: string }
    expect(root).toMatchObject({ route: 'published-delay', state: 'delayed' })
    expect(Date.parse(root.delayEndsAt!) - (await clockNow(ownerPage)).getTime()).toBeGreaterThan(71 * HOUR)
    await advance(ownerPage, 71 * HOUR)
    expect((await maintain(ownerPage)).identity.appliedChanges).toBe(0)
    await advance(ownerPage, 2 * HOUR)
    await maintain(ownerPage)
    expect((await changeOf(ownerPage, root.changeId)).state).toBe('applied')
    delayedRoot = root.createdId
    expect((await membershipIn(requester.page, delayedRoot))?.owner).toBe(true)

    // Its sole owner, with no parent and nobody above: a critical change waits 7 days, and may be cancelled.
    await requester.signInWithPasskey()
    const raise = (critical: 1 | 2) => requestChange(requester.page, { type: 'group.change-approvals', target: { groupId: delayedRoot, approvals: { required: { low: 0, medium: 0, high: 1, critical }, referenceRequired: false } } })
    const cancelled = await (await raise(2)).json() as Change
    expect(cancelled).toMatchObject({ route: 'published-delay', state: 'delayed' })
    expect((await requester.page.request.post(`/api/identity/changes/${cancelled.changeId}/cancel`, { headers })).status()).toBe(200)

    const waiting = await (await raise(2)).json() as Change
    expect(Date.parse(waiting.delayEndsAt!) - (await clockNow(ownerPage)).getTime()).toBeGreaterThan(167 * HOUR)
    await advance(ownerPage, 6 * DAY)
    await maintain(ownerPage)
    expect((await changeOf(requester.page, waiting.changeId)).state).toBe('delayed')
    await advance(ownerPage, DAY + HOUR)
    await maintain(ownerPage)
    expect((await changeOf(requester.page, waiting.changeId)).state).toBe('applied')
    expect((await changeOf(requester.page, cancelled.changeId)).state).toBe('cancelled')
  })

  test('safety periods: a group cannot be less safe than the platform, and the platform shortening a delay waits out the old one', async () => {
    await requester.signInWithPasskey()
    const lessSafe = await requestChange(requester.page, { type: 'group.change-safety-periods', target: { groupId: delayedRoot, safetyPeriods: { publishedDelayCriticalHours: 72 } } })
    expect(lessSafe.status()).toBe(409)

    await owner.signInWithPasskey()
    const shorten = (reference: string | null) => requestChange(ownerPage, { type: 'group.change-safety-periods', target: { groupId: platformGroupId, safetyPeriods: { publishedDelayCriticalHours: 96 } } }, reference)
    // Less safe than the host's value: only with a reference to its risk treatment.
    expect((await shorten(null)).status()).toBe(409)
    const shorter = await shorten('RT-HARNESS-1')
    expect(shorter.status()).toBe(201)
    const change = await shorter.json() as Change
    expect(change.route).toBe('published-delay')
    // The old delay (7 days), not the shorter one.
    expect(Date.parse(change.delayEndsAt!) - (await clockNow(ownerPage)).getTime()).toBeGreaterThan(167 * HOUR)
    expect((await ownerPage.request.post(`/api/identity/changes/${change.changeId}/cancel`, { headers })).status()).toBe(200)
  })

  // ---------------------------------------------------------------------------
  // Recovery (iam-integration docs/processes/recovery.md)
  // ---------------------------------------------------------------------------

  test('recovery: after a password reset a critical change needs step-up, and one requested within the hold waits for its end even when approved', async ({ browser }) => {
    const recovered = await personWithPasskey(browser)
    const member = await anotherPerson(browser)
    try {
      await join(recovered.page, ownerPage, platformGroupId)
      const team = await createGroup(recovered.page, platformGroupId, 'Recovered Team')
      await join(member.page, recovered.page, team)

      // The person resets their password, then signs in with it alone.
      expect((await recovered.page.request.post('/api/authentication/password/forgot', { data: { email: recovered.email }, headers })).status()).toBeLessThan(300)
      const resetLink = await lastLink(recovered.page.request, recovered.email, 'password-reset')
      const token = new URL(resetLink, ORIGIN).searchParams.get('token')!
      const NEW_PASSWORD = 'a new harness passphrase that is long enough'
      expect((await recovered.page.request.post('/api/authentication/password/reset', { data: { token, password: NEW_PASSWORD }, headers })).status()).toBeLessThan(300)
      expect((await recovered.page.request.post('/api/authentication/sign-in', { data: { email: recovered.email, password: NEW_PASSWORD }, headers })).status()).toBe(200)

      const target = { membershipId: (await membershipIn(member.page, team))!.membershipId }
      // The recovered password session is below the platform's required level: no member treats it as the person.
      const refused = await requestChange(recovered.page, { type: 'group.add-owner', target })
      expect(refused.status()).toBe(401)

      // Stepped up with the passkey: recorded, but held.
      await recovered.signInWithPasskey()
      const held = await (await requestChange(recovered.page, { type: 'group.add-owner', target })).json() as Change
      await relay(ownerPage)
      expect((await events(ownerPage)).some(e => e.type === 'approval.held' && e.data.changeId === held.changeId)).toBe(true)
      await owner.signInWithPasskey()
      expect((await decide(ownerPage, held)).status()).toBe(200)
      await maintain(ownerPage)
      expect((await changeOf(recovered.page, held.changeId)).state).toBe('delayed')
      await advance(ownerPage, 73 * HOUR)
      await maintain(ownerPage)
      expect((await changeOf(ownerPage, held.changeId)).state).toBe('applied')
    } finally {
      await recovered.close()
      await member.close()
    }
  })

  test('recovery: an orphaned group gains an owner only after approval or the published delay; recovery never reaches a personal group', async ({ browser }) => {
    const leaving = await anotherPerson(browser)
    const successor = await anotherPerson(browser)
    try {
      await join(leaving.page, ownerPage, platformGroupId)
      const team = await createGroup(leaving.page, platformGroupId, 'Orphaned Team')
      await join(successor.page, leaving.page, team)
      const { actor } = await (await leaving.page.request.get('/api/identity/me')).json() as { actor: { personalGroup: { groupId: string } } }
      // Its sole owner pauses their identity: the group is orphaned.
      expect((await leaving.page.request.post('/api/identity/me/pause', { headers })).status()).toBe(200)
      await relay(ownerPage)
      expect(((await (await successor.page.request.get(`/api/identity/groups/${team}`)).json()) as { group: { state: string } }).group.state).toBe('orphaned')
      // Nothing reaches the paused person's personal group.
      expect((await ownerPage.request.get(`/api/identity/groups/${actor.personalGroup.groupId}`)).status()).toBe(403)

      // The parent group's owner proposes the member; nobody else is above, so the published delay (14 days) applies.
      await owner.signInWithPasskey()
      const appoint = await requestChange(ownerPage, { type: 'group.appoint-owner', target: { membershipId: (await membershipIn(successor.page, team))!.membershipId } })
      expect(appoint.status()).toBe(201)
      const change = await appoint.json() as Change
      expect(change.route).toBe('published-delay')
      await advance(ownerPage, 13 * DAY)
      await maintain(ownerPage)
      expect((await membershipIn(successor.page, team))?.owner).toBe(false)
      await advance(ownerPage, 2 * DAY)
      await maintain(ownerPage)
      expect((await changeOf(ownerPage, change.changeId)).state).toBe('applied')
      expect((await membershipIn(successor.page, team))?.owner).toBe(true)
    } finally {
      await leaving.close()
      await successor.close()
    }
  })

  test('recovery: an objection during the delay stops an orphaned root group\'s automatic appointment', async ({ browser }) => {
    // The delayed root group: its sole owner is the requester. Two members join, then the owner pauses.
    const proposer = await personWithPasskey(browser)
    const objector = await anotherPerson(browser)
    try {
      await requester.signInWithPasskey()
      await join(proposer.page, requester.page, delayedRoot)
      await join(objector.page, requester.page, delayedRoot)
      expect((await requester.page.request.post('/api/identity/me/pause', { headers })).status()).toBe(200)
      await relay(ownerPage)

      // Nobody is above a root group: a member proposes the longest-standing member, themselves.
      await proposer.signInWithPasskey()
      const proposal = await requestChange(proposer.page, { type: 'group.appoint-owner', target: { membershipId: (await membershipIn(proposer.page, delayedRoot))!.membershipId } })
      expect(proposal.status()).toBe(201)
      const change = await proposal.json() as Change
      expect(change.route).toBe('published-delay')
      expect((await objector.page.request.post(`/api/identity/changes/${change.changeId}/objection`, { headers })).status()).toBe(200)
      expect((await changeOf(proposer.page, change.changeId)).route).toBe('platform-operator')

      await advance(ownerPage, 15 * DAY)
      await maintain(ownerPage)
      expect((await membershipIn(proposer.page, delayedRoot))?.owner).toBe(false)
    } finally {
      await proposer.close()
      await objector.close()
    }
  })

  // ---------------------------------------------------------------------------
  // Account closure (iam-integration docs/processes/account-closure.md)
  // ---------------------------------------------------------------------------

  test('account closure: cancelling during the grace period restores the identity and its memberships unchanged', async ({ browser }) => {
    const person = await anotherPerson(browser)
    try {
      await join(person.page, ownerPage, platformGroupId)
      const before = await (await person.page.request.get('/api/identity/me')).json() as { actor: { memberships: unknown[] } }
      const closure = await person.page.request.post('/api/identity/me/closure', { data: {}, headers })
      expect(closure.status()).toBe(200)
      expect((await closure.json()).state).toBe('closure-pending')
      await relay(ownerPage)
      // Closure ends every session; the person signs in again only to cancel.
      expect((await (await person.page.request.get('/api/authentication/session')).json()).principal).toBeNull()
      expect((await person.page.request.post('/api/authentication/sign-in', { data: { email: person.email, password: PASSWORD }, headers })).status()).toBe(200)
      const cancelled = await person.page.request.delete('/api/identity/me/closure', { headers })
      expect(cancelled.status()).toBe(200)
      await relay(ownerPage)
      const after = await (await person.page.request.get('/api/identity/me')).json() as { actor: { identityState: string, memberships: unknown[] } }
      expect(after.actor.identityState).toBe('active')
      expect(after.actor.memberships).toEqual(before.actor.memberships)
    } finally {
      await person.close()
    }
  })

  test('account closure: after the grace period no member holds the person\'s data, and the address signs up afresh as a new identity', async ({ browser }) => {
    const person = await anotherPerson(browser)
    try {
      await join(person.page, ownerPage, platformGroupId)
      const own = await (await person.page.request.get('/api/profile/me')).json() as { version: number }
      expect((await person.page.request.patch('/api/profile/me', { data: { expectedVersion: own.version, changes: { name: 'Closing Person' } }, headers })).status()).toBe(200)
      expect((await person.page.request.post('/api/identity/me/closure', { data: {}, headers })).status()).toBe(200)
      await relay(ownerPage)

      await advance(ownerPage, 31 * DAY)
      expect((await maintain(ownerPage)).identity.closedIdentities).toBeGreaterThanOrEqual(1)
      await relay(ownerPage)
      const holdings = await (await ownerPage.request.get(`/api/__harness/iam/holdings?identityId=${person.principalId}`)).json()
      expect(holdings).toMatchObject({ authentication: null, authorisation: null, profile: null })
      expect(holdings.identity.identity.state).toBe('closed')
      expect(JSON.stringify(holdings)).not.toMatch(new RegExp(`Closing Person|${person.email.replace(/\./g, '\\.')}`))

      // The address is free: signing up afresh makes a new identity.
      const fresh = await browser.newContext({ baseURL: ORIGIN })
      try {
        const page = await fresh.newPage()
        expect((await page.request.post('/api/authentication/sign-up', { data: { email: person.email, password: PASSWORD }, headers })).status()).toBe(202)
        await page.goto(await lastLink(page.request, person.email, 'email-verification'))
        expect((await page.request.post('/api/authentication/sign-in', { data: { email: person.email, password: PASSWORD }, headers })).status()).toBe(200)
        const again = (await (await page.request.get('/api/authentication/session')).json()).principal.principalId
        expect(again).toMatch(UUID_V7)
        expect(again).not.toBe(person.principalId)
      } finally {
        await fresh.close()
      }
    } finally {
      await person.close()
    }
  })

  test('account closure: a legal hold keeps Authentication\'s part, refusing sign-in, until it ends', async ({ browser }) => {
    const person = await anotherPerson(browser)
    try {
      const endsAt = new Date((await clockNow(ownerPage)).getTime() + 365 * DAY).toISOString()
      const placed = await ownerPage.request.post('/api/__harness/iam/legal-holds', { data: { identityId: person.principalId, parts: ['authentication'], endsAt }, headers })
      expect(placed.status()).toBe(200)
      const { holdId } = await placed.json()
      expect((await person.page.request.post('/api/identity/me/closure', { data: {}, headers })).status()).toBe(200)
      await advance(ownerPage, 31 * DAY)
      await maintain(ownerPage)
      await relay(ownerPage)

      const holdings = async () => (await ownerPage.request.get(`/api/__harness/iam/holdings?identityId=${person.principalId}`)).json()
      const held = await holdings()
      expect(held.authentication).not.toBeNull()
      expect(held.authorisation).toBeNull()
      // The account is kept, but the closed identity cannot sign in, nor can its address sign up afresh.
      const signIn = () => person.page.request.post('/api/authentication/sign-in', { data: { email: person.email, password: PASSWORD }, headers })
      expect((await signIn()).status()).not.toBe(200)
      const verifications = async () => (await recorder(person.page.request)).messages.filter(m => m.to === person.email && m.kind === 'email-verification').length
      const before = await verifications()
      expect((await person.page.request.post('/api/authentication/sign-up', { data: { email: person.email, password: PASSWORD }, headers })).status()).toBe(202)
      expect(await verifications()).toBe(before)

      // The hold ends: the deferred erasure happens.
      expect((await ownerPage.request.post('/api/__harness/iam/legal-holds/release', { data: { holdId }, headers })).status()).toBe(200)
      await expect.poll(async () => (await holdings()).authentication).toBeNull()
      expect((await signIn()).status()).not.toBe(200)
    } finally {
      await person.close()
    }
  })

  // ---------------------------------------------------------------------------
  // Break-glass access (iam-integration docs/processes/break-glass.md)
  // ---------------------------------------------------------------------------

  test('break-glass: a passkey-only account enrolled once, acting only within its limits, rotated after use and reviewed by another operator', async ({ browser }) => {
    const address = `break-glass.${Date.now()}@example.com`
    const provisioned = await ownerPage.request.post('/api/__harness/iam/break-glass', { data: { address }, headers })
    expect(provisioned.status()).toBe(200)
    const { identityId } = await provisioned.json() as { identityId: string }
    const links = async () => ((await (await ownerPage.request.get('/api/__harness/iam/break-glass/links')).json()) as { identityId: string, link: string }[]).filter(l => l.identityId === identityId)
    const [first] = await links()
    const firstToken = new URL(first!.link).hash.slice(1)

    // The holder enrols a passkey on the offline device; the page signs nobody in.
    const holder = await browser.newContext({ baseURL: ORIGIN })
    const target = await anotherPerson(browser)
    try {
      const page = await holder.newPage()
      const client = await holder.newCDPSession(page)
      await client.send('WebAuthn.enable')
      await client.send('WebAuthn.addVirtualAuthenticator', {
        options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }
      })
      await page.goto(first!.link)
      await page.getByRole('button', { name: 'Register passkey' }).click()
      await expect(page.getByText('The passkey is registered.')).toBeVisible()
      expect((await (await page.request.get('/api/authentication/session')).json()).principal).toBeNull()

      // The link works once: used, it answers as an unknown one does.
      const options = (token: string) => page.request.post('/api/authentication/break-glass/enrolment-options', { data: { token }, headers })
      const used = await options(firstToken)
      const unknown = await options('A'.repeat(43))
      expect(used.status()).toBe(unknown.status())
      expect(await used.json()).toEqual(await unknown.json())

      // No password exists, and none can be reset.
      expect((await page.request.post('/api/authentication/sign-in', { data: { email: address, password: PASSWORD }, headers })).status()).not.toBe(200)
      await page.request.post('/api/authentication/password/forgot', { data: { email: address }, headers })
      expect((await recorder(page.request)).messages.some(m => m.to === address && m.kind === 'password-reset')).toBe(false)

      // The passkey signs in: phishing-resistant aal2.
      const signInWithPasskey = async () => {
        await page.goto(`/sign-in?redirect=${encodeURIComponent('/account/groups')}`)
        await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
      }
      await signInWithPasskey()
      await expect.poll(async () => (await (await page.request.get('/api/authentication/session')).json()).principal?.principalId).toBe(identityId)
      const session = await (await page.request.get('/api/authentication/session')).json()
      expect(session.principal.assurance).toMatchObject({ level: 'aal2', phishingResistant: true })

      // Only its three actions, never on itself.
      const act = (action: string, targetId: string) => page.request.post('/api/identity/break-glass/actions', { data: { action, targetId, reasonCode: 'incident' }, headers })
      expect((await act('suspend-identity', identityId)).status()).not.toBe(201)
      // An owner only for an orphaned group: the platform group has its owner.
      expect((await act('appoint-owner', (await membershipIn(ownerPage, platformGroupId))!.membershipId)).status()).not.toBe(201)
      const acted = await act('suspend-identity', target.principalId)
      expect(acted.status()).toBe(201)
      const review = await acted.json() as { reviewId: string }
      await relay(ownerPage)
      expect((await events(ownerPage)).some(e => e.type === 'break-glass.used' && e.data.reviewId === review.reviewId)).toBe(true)
      // The suspended person is signed out and cannot sign in.
      expect((await (await target.page.request.get('/api/authentication/session')).json()).principal).toBeNull()
      expect((await target.page.request.post('/api/authentication/sign-in', { data: { email: target.email, password: PASSWORD }, headers })).status()).not.toBe(200)

      // Rotated: the holder's passkey and session are gone, and a new link reached the operators.
      await expect.poll(async () => (await links()).length).toBe(2)
      expect((await (await page.request.get('/api/authentication/session')).json()).principal).toBeNull()
      await signInWithPasskey()
      await page.waitForTimeout(1_000)
      expect((await (await page.request.get('/api/authentication/session')).json()).principal).toBeNull()

      // The review: never closed by whoever held the passkey; another operator closes it.
      await owner.signInWithPasskey()
      const close = (heldPasskey: boolean) => ownerPage.request.post('/api/__harness/iam/break-glass/review', { data: { reviewId: review.reviewId, heldPasskey }, headers })
      expect((await close(true)).status()).toBe(409)
      expect((await close(false)).status()).toBe(200)
      await relay(ownerPage)
      expect((await events(ownerPage)).some(e => e.type === 'break-glass.review-closed' && e.data.reviewId === review.reviewId)).toBe(true)
      expect(JSON.stringify(await events(ownerPage))).not.toContain(address)
    } finally {
      await holder.close()
      await target.close()
    }
  })
})
