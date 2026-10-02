import { expect, test } from '@playwright/test'

test('harness composes Theme Manager and exposes runtime probes', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Theme Manager black-box test application' })).toBeVisible()
  await expect(page.getByText('Theme Manager layer composes through its package root')).toBeVisible()
  await expect(page.getByTestId('theme-probe')).toBeVisible()
  await expect(page.getByTestId('theme-probe-effects')).toBeVisible()
})

test('seeded Theme exposes the complete presentation families', async ({ page }) => {
  await page.goto('/theme-manager/test-theme')

  await page.getByRole('tab', { name: 'Spacing' }).click()
  await expect(page.getByText('No spacing values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Radii' }).click()
  await expect(page.getByText('No radii values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Typography' }).click()
  await expect(page.getByText('No typography values are present in this Theme.')).toHaveCount(0)
})

test('runtime presentation variables drive the independent consumer probe', async ({ page }) => {
  await page.goto('/theme-manager/test-theme')
  await page.getByRole('button', { name: 'Light' }).click()
  await page.goto('/')

  const probe = page.getByTestId('theme-probe')
  const effects = page.getByTestId('theme-probe-effects')

  await expect(probe).toHaveCSS('border-radius', '8px')
  await expect(probe).toHaveCSS('font-size', '16px')
  await expect(probe).toHaveCSS('font-weight', '700')
  await expect(effects).toHaveCSS('border-radius', '16px')
  await expect(effects).toHaveCSS('font-size', '18px')
})
