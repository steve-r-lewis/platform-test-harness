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

  await page.getByRole('button', { name: 'Spacing' }).click()
  await expect(page.getByText('No spacing values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Radii' }).click()
  await expect(page.getByText('No radii values are present in this Theme.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Typography' }).click()
  await expect(page.getByText('No typography values are present in this Theme.')).toHaveCount(0)
})

test('Theme Manager runtime presentation drives a Tailwind consumer through the complete cascade', async ({ page }) => {
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


test('editing a radius through Theme Manager UI persists and drives the Tailwind consumer', async ({ page }) => {
  await page.goto('/theme-manager/test-theme')
  await page.getByRole('button', { name: 'Radii' }).click()

  const radius = page.getByLabel('xl', { exact: true })
  await expect(radius).toHaveValue('16px')
  await radius.fill('13px')

  // The editor preview must already drive the consumer runtime before persistence.
  await page.goto('/')
  await expect(page.getByTestId('theme-probe-effects')).toHaveCSS('border-radius', '13px')

  // Return to the editor, persist the mutation through the public Save workflow,
  // then select the saved Theme through the Theme Library.
  await page.goto('/theme-manager/test-theme')
  await page.getByRole('button', { name: 'Radii' }).click()
  await page.getByLabel('xl', { exact: true }).fill('13px')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page).toHaveURL(/\/theme-manager\/?$/)
  await page.getByRole('button', { name: 'Use' }).click()
  await page.goto('/')

  await expect(page.getByTestId('theme-probe-effects')).toHaveCSS('border-radius', '13px')

  // Reload the editor from the repository to prove that the same value was persisted.
  await page.goto('/theme-manager/test-theme')
  await page.getByRole('button', { name: 'Radii' }).click()
  await expect(page.getByLabel('xl', { exact: true })).toHaveValue('13px')
})
