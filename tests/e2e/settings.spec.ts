import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Person } from './support/iam'
import { advance, DAY, headers, maintain, personWithPasskey } from './support/iam'

/**
 * The configuration layer composed with the IAM suite, connected only through
 * its own reference adapters (server/plugins/settings-harness.ts): its pages
 * decide nothing, and every change goes through Identity's approval rules and
 * Authorisation's permissions. The layer's own behaviour is tested in its
 * repository.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const setting = (page: Page, name: string): Locator => page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name, exact: true }) })

async function expectAccessible(page: Page) {
  for (const dark of [false, true]) {
    await page.evaluate(on => document.documentElement.classList.toggle('dark', on), dark)
    const results = await new AxeBuilder({ page }).include('main').withTags(WCAG_TAGS).analyze()
    expect(results.violations.map(v => `${dark ? 'dark' : 'light'} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
}

test.describe.serial('Settings: the configuration layer through the IAM suite', () => {
  /** The founding owner of a tenant's root group, with a passkey. */
  let owner: Person
  let rootGroup: string

  test.beforeAll(async ({ browser }) => {
    owner = await personWithPasskey(browser)
    const provisioned = await owner.page.request.post('/api/__harness/iam/tenants', { data: { ownerId: owner.principalId, name: 'Settings Root' }, headers })
    expect(provisioned.status()).toBe(200)
    rootGroup = (await provisioned.json()).groupId
  })

  test.afterAll(async () => {
    await owner?.close()
  })

  test('an owner changes a low-risk setting of their group at once, on pages that meet WCAG 2.2 AA', async () => {
    const page = owner.page
    await page.goto(`/configuration?scope=group&groupId=${rootGroup}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expectAccessible(page)
    const tagline = setting(page, 'Tagline')
    await tagline.getByRole('button', { name: 'Change' }).click()
    await tagline.getByLabel('Tagline').fill('Settings through the IAM suite')
    await tagline.getByRole('button', { name: 'Save' }).click()
    await expect(tagline.getByRole('status')).toHaveText('Saved.')
    await expect(tagline).toContainText('Set here')
  })

  test('a high-risk change waits out Identity\'s published delay when nobody else can approve it', async () => {
    const page = owner.page
    await page.goto(`/configuration?scope=group&groupId=${rootGroup}`)
    const legal = setting(page, 'Legal name')
    await legal.getByRole('button', { name: 'Change' }).click()
    await legal.getByLabel('Legal name').fill('Settings Root Ltd')
    await legal.getByRole('button', { name: 'Save' }).click()
    await expect(legal.getByRole('status')).toContainText('Nobody else can approve this')
    await expect(legal).toContainText('Not set')

    await page.goto(`/configuration/changes?scope=group&groupId=${rootGroup}`)
    await expect(page.getByRole('article', { name: 'Legal name' })).toContainText('You requested this change.')
    await expectAccessible(page)

    await advance(page, 3 * DAY + 60_000)
    expect((await maintain(page) as { configuration: { applied: number } }).configuration.applied).toBe(1)
    await page.goto(`/configuration?scope=group&groupId=${rootGroup}`)
    await expect(setting(page, 'Legal name')).toContainText('Settings Root Ltd')
  })

  test('a tenant owner cannot change the platform\'s settings', async () => {
    const page = owner.page
    await page.goto('/configuration?scope=platform')
    await expect(page.getByRole('alert')).toContainText(/cannot administer these settings|unavailable/)
    await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0)
    const refused = await page.request.post('/api/configuration/changes', {
      data: { target: { scope: 'platform' }, set: { 'site.tagline': 'x' }, expected: { 'site.tagline': null }, justification: { reasonCode: 'update' } },
      headers
    })
    expect([403, 503]).toContain(refused.status())
  })
})
