import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { ORIGIN, PASSWORD, verifiedAccount } from './support/authentication'

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
  let ownerPage: Page
  let platformGroupId: string

  test('provisioning: Identity issues the account\'s identifier and confirms it once the address is verified', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: ORIGIN })
    ownerPage = await context.newPage()
    const { principalId } = await signedIn(ownerPage)
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
})
