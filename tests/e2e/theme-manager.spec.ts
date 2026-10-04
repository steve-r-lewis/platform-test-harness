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

  await page.getByRole('tab', { name: 'spacing' }).click()
  await expect(page.getByText('No spacing values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('tab', { name: 'radii' }).click()
  await expect(page.getByText('No radii values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('tab', { name: 'typography' }).click()
  await expect(page.getByText('No typography values are present in this Theme.')).toHaveCount(0)
})

test('Theme Manager runtime presentation drives a Tailwind consumer through the complete cascade', async ({ page }) => {
  await signInAtAal2(page)
  await page.goto('/theme-manager/test-theme')
  await page.getByRole('button', { name: 'Light' }).click()
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
  await expect(effects).toHaveCSS('border-radius', '16px')
  await expect(effects).toHaveCSS('padding-top', '16px')
  await expect(effects).toHaveCSS('font-size', '18px')
})

test('saved runtime Theme survives a fresh consumer navigation', async ({ page }) => {
  await signInAtAal2(page)
  await page.goto('/theme-manager/test-theme')

  await page.getByRole('tab', { name: 'radii' }).click()
  const xlRadius = page.getByLabel('xl')
  await xlRadius.fill('13px')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Use' }).click()

  await page.goto('/')

  await expect(page.getByTestId('theme-probe-effects')).toHaveCSS('border-radius', '13px')
})
