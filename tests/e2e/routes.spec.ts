import { expect, test, type Page } from '@playwright/test'
import { ORIGIN, signInAtAal2, signInWithPassword, verifiedAccount } from './support/authentication'

/**
 * The harness's routing convention (README, "Routes and access"): every page
 * needs a session at the policy's required level unless it is named public, and
 * the signed-in application's modules are reached from one menu.
 */

/** One page of each layer and module, and a path nothing serves: none is public. */
const SIGNED_IN_PAGES = [
  '/theme-manager',
  '/theme-manager/new',
  '/theme-manager/test-theme',
  '/account/groups',
  '/account/security',
  '/groups/00000000-0000-0000-0000-000000000000',
  '/groups/00000000-0000-0000-0000-000000000000/access',
  '/changes/00000000-0000-0000-0000-000000000000',
  '/tenants/00000000-0000-0000-0000-000000000000/roles',
  '/profile',
  '/profile/requests',
  '/no-such-page'
]

/** On `path` (sign-in or the second-factor page), asked to return to `redirect` afterwards. */
async function expectSentTo(page: Page, path: string, redirect: string) {
  await expect.poll(() => {
    const url = new URL(page.url())
    return `${url.pathname} ${url.searchParams.get('redirect')}`
  }, { message: redirect }).toBe(`${path} ${redirect}`)
}

const MODULES = ['Theme Manager', 'Groups', 'Profile', 'Data requests', 'Security']

test('anonymous visitors are sent to sign-in from every page of the signed-in application', async ({ page }) => {
  for (const path of SIGNED_IN_PAGES) {
    await page.goto(path)
    await expectSentTo(page, '/sign-in', path)
  }
})

test('anonymous visitors see no modules, only the way to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Modules' })).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Create Theme' })).toHaveCount(0)
})

test('a password-only session is sent to the second factor from any signed-in page', async ({ page }) => {
  const email = await verifiedAccount(page)
  await signInWithPassword(page, email)
  await page.goto('/profile')
  await expectSentTo(page, '/mfa', '/profile')
  await expect(page.getByRole('navigation', { name: 'Modules' })).toHaveCount(0)
})

test('signed in, the modules menu opens each module, each page with one main landmark', async ({ page }) => {
  await signInAtAal2(page)
  const menu = page.getByRole('navigation', { name: 'Modules' }).first()
  for (const module of MODULES) {
    const link = menu.getByRole('link', { name: module })
    const target = (await link.getAttribute('href'))!
    await link.click()
    await expect(page, module).toHaveURL(target)
    await expect(page.getByRole('main'), module).toHaveCount(1)
  }
})

test('a session that ended elsewhere is noticed at the next navigation', async ({ page }) => {
  await signInAtAal2(page)
  const menu = page.getByRole('navigation', { name: 'Modules' }).first()
  await menu.getByRole('link', { name: 'Theme Manager' }).click()
  await expect(page).toHaveURL('/theme-manager')

  // Signed out by another tab: the page still shows the menu until the next navigation.
  expect((await page.request.post('/api/authentication/sign-out', { headers: { origin: ORIGIN } })).status()).toBe(200)
  await menu.getByRole('link', { name: 'Profile' }).click()
  await expectSentTo(page, '/sign-in', '/profile')
  await expect(page.getByRole('navigation', { name: 'Modules' })).toHaveCount(0)
})

test('signing out from the account menu leaves the signed-in application', async ({ page }) => {
  await signInAtAal2(page)
  await page.getByRole('banner').getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Modules' })).toHaveCount(0)
  await page.goto('/theme-manager')
  await expectSentTo(page, '/sign-in', '/theme-manager')
})
