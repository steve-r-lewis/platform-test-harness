import { expect, test } from '@playwright/test'
import { signInAtAal2 } from './support/authentication'

// Theme administration is behind sign-in in this harness (see authentication.spec.ts).

test('harness composes Theme Manager and exposes runtime probes', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Theme Manager black-box test application' })).toBeVisible()
  await expect(page.getByText('Theme Manager layer composes through its package root')).toBeVisible()
  await expect(page.getByTestId('theme-probe')).toBeVisible()
  await expect(page.getByTestId('theme-probe-effects')).toBeVisible()
})

test('seeded Theme exposes the complete presentation families', async ({ page }) => {
  await signInAtAal2(page)
  await page.goto('/theme-manager/test-theme')

  // Each family has its own editor; a completed vocabulary fills every one.
  const families = [
    ['spacing', 'Spacing steps', 'Spacing steps: step-2xs'],
    ['radii', 'Corner radii', 'Corner radii: xl'],
    ['typography', 'Font families', 'Size base'],
    ['motion', 'Durations', 'Durations: base in milliseconds']
  ] as const
  for (const [tab, heading, field] of families) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expect(page.getByLabel(field, { exact: true })).toBeVisible()
  }
})

test('Theme Manager runtime presentation drives a Tailwind consumer through the complete cascade', async ({ page }) => {
  await signInAtAal2(page)
  await page.goto('/theme-manager/test-theme')
  await page.goto('/')

  const probe = page.getByTestId('theme-probe')
  const effects = page.getByTestId('theme-probe-effects')

  // These are Tailwind utilities in the harness, not direct --api-* consumers.
  // Passing assertions therefore exercise theme-default.css → theme-api.css → tailwind-config.css.
  await expect(probe).toHaveCSS('border-radius', '8px')
  await expect(probe).toHaveCSS('padding-top', '12px')
  await expect(probe).toHaveCSS('padding-left', '20px')
  await expect(probe).toHaveCSS('font-size', '16px')
  await expect(probe).toHaveCSS('font-weight', '700')
  // rounded-xl follows the locked default scale (--ui-radius-xl: 0.75rem).
  await expect(effects).toHaveCSS('border-radius', '12px')
  await expect(effects).toHaveCSS('padding-top', '16px')
  await expect(effects).toHaveCSS('font-size', '18px')
})

test('saved runtime Theme survives a fresh consumer navigation', async ({ page }) => {
  await signInAtAal2(page)
  await page.goto('/theme-manager/test-theme')

  await page.getByRole('tab', { name: 'radii' }).click()
  await page.getByLabel('Corner radii: xl unit').selectOption('px')
  await page.getByLabel('Corner radii: xl', { exact: true }).fill('13')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/theme-manager$/)
  await page.getByRole('article').filter({ hasText: 'Harness Test Theme' }).getByRole('button', { name: 'Use' }).click()

  await page.goto('/')

  await expect(page.getByTestId('theme-probe-effects')).toHaveCSS('border-radius', '13px')
})
