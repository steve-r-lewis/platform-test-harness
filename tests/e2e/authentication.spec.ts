import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ORIGIN, PASSWORD, enrolAuthenticator, freshEmail, recorder, signInAtAal2, signInWithPassword, verifiedAccount } from './support/authentication'

/**
 * Authentication composed beside Theme Manager and Nuxt UI: composition
 * conflicts, the principal-to-actor mapping, and negative paths across the
 * layer boundary. The layer's own behaviour is tested in its repository.
 */

/** Axe on the layer's page content; the harness shell (Nuxt UI) is not under test here. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}

async function themeWrite(page: Page) {
  const theme = await (await page.request.get('/api/themes/test-theme')).json()
  return page.request.put('/api/themes/test-theme', { data: theme, headers: { origin: ORIGIN } })
}

test.describe('composition', () => {
  test('authentication pages are served beside Theme Manager administration routes', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('h1')).toBeVisible()
    }
    expect((await page.request.get('/api/themes/test-theme')).status()).toBe(200)
  })

  test('layer pages keep Theme Manager styling alongside Nuxt UI', async ({ page }) => {
    await page.goto('/sign-in')
    const button = page.getByRole('button', { name: 'Sign in', exact: true })
    await expect(button).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    // Nuxt UI's own utilities still work in the host shell.
    await expect(page.getByRole('link', { name: 'Theme Manager Test Harness' })).toBeVisible()
  })

  test('composed pages meet the automated WCAG 2.2 AA rules in light and dark mode', async ({ page }) => {
    for (const dark of [false, true]) {
      for (const path of ['/sign-in', '/sign-up', '/forgot-password']) {
        await page.goto(path)
        await page.evaluate(on => document.documentElement.classList.toggle('dark', on), dark)
        await expectAccessible(page)
      }
    }
  })

  test('each composed page has exactly one main landmark', async ({ page }) => {
    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/']) {
      await page.goto(path)
      await expect(page.locator('main, [role="main"]'), path).toHaveCount(1)
    }
  })

  test('layer security headers survive composition', async ({ request }) => {
    const headers = (await request.get('/sign-in')).headers()
    expect(headers['content-security-policy']).toContain('frame-ancestors \'none\'')
    expect(headers['cache-control']).toBe('no-store')
  })
})

test.describe('principal to Theme actor', () => {
  test('anonymous visitors are sent to sign-in for Theme administration', async ({ page }) => {
    await page.goto('/theme-manager')
    await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)theme-manager$/)
  })

  test('Theme changes are refused to anonymous and password-only (aal1) sessions', async ({ page }) => {
    expect((await themeWrite(page)).status()).toBe(403)

    const email = await verifiedAccount(page)
    await signInWithPassword(page, email, '/theme-manager')
    // Signed in, but below the required assurance: Theme Manager sees an anonymous actor.
    expect((await themeWrite(page)).status()).toBe(403)

    await enrolAuthenticator(page)
    await expect(page).toHaveURL(/\/theme-manager$/)
    expect((await themeWrite(page)).status()).toBe(200)
  })

  test('signing out returns the actor to anonymous', async ({ page }) => {
    await signInAtAal2(page)
    expect((await themeWrite(page)).status()).toBe(200)
    expect((await page.request.post('/api/authentication/sign-out', { headers: { origin: ORIGIN } })).status()).toBe(200)
    expect((await themeWrite(page)).status()).toBe(403)
  })
})

test.describe('negative paths across the boundary', () => {
  test('cross-origin authentication requests are refused', async ({ request }) => {
    const response = await request.post('/api/authentication/sign-in', {
      data: { email: freshEmail(), password: PASSWORD },
      headers: { origin: 'https://attacker.example' }
    })
    expect(response.status()).toBe(403)
    expect((await response.json()).code ?? (await response.json()).data?.code).toBe('origin-rejected')
  })

  test('a forged session cookie is anonymous to both layers', async ({ page, context }) => {
    await context.addCookies([{ name: 'authentication.session_token', value: 'forged.token', url: ORIGIN }])
    expect((await (await page.request.get('/api/authentication/session')).json()).principal).toBeNull()
    expect((await themeWrite(page)).status()).toBe(403)
  })

  test('events reach the host sink without secrets or email addresses', async ({ page }) => {
    const email = await signInAtAal2(page)
    const { events } = await recorder(page.request)
    expect(events.length).toBeGreaterThan(0)
    const serialised = JSON.stringify(events)
    expect(serialised).not.toContain(email)
    expect(serialised).not.toContain(PASSWORD)
  })
})
