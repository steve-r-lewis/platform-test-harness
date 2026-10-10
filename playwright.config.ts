import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

/**
 * Black-box tests of the composed harness. Authentication needs a disposable
 * PostgreSQL: HARNESS_POSTGRES_URL is an admin connection (default: a local
 * server); the suite recreates the `platform_harness_e2e` database each run.
 * Passkeys and the origin check need a host name, so the harness serves on
 * localhost rather than 127.0.0.1.
 */
const ORIGIN = 'http://localhost:3000'
const database = new URL(process.env.HARNESS_POSTGRES_URL ?? 'postgres://postgres@localhost:5432/postgres')
database.pathname = '/platform_harness_e2e'
// Identity's runtime role, created by prepare-database.mjs.
const identityRuntime = new URL(database)
identityRuntime.username = 'harness_identity_runtime'
identityRuntime.password = 'harness-identity-runtime-password'
// Profile's runtime role, likewise.
const profileRuntime = new URL(database)
profileRuntime.username = 'harness_profile_runtime'
profileRuntime.password = 'harness-profile-runtime-password'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'on-first-retry',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}
  },
  webServer: {
    command: 'node tests/e2e/prepare-database.mjs && pnpm dev --host localhost',
    url: `${ORIGIN}/api/authentication/policy`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      HARNESS_DATABASE_URL: database.toString(),
      HARNESS_IDENTITY_DATABASE_URL: identityRuntime.toString(),
      NUXT_IDENTITY_BASE_URL: ORIGIN,
      HARNESS_PROFILE_DATABASE_URL: profileRuntime.toString(),
      // A fresh master key for each run, unless one is supplied.
      HARNESS_PROFILE_MASTER_KEY: process.env.HARNESS_PROFILE_MASTER_KEY ?? randomBytes(32).toString('base64'),
      NUXT_PROFILE_BASE_URL: ORIGIN,
      NUXT_AUTHORISATION_BASE_URL: ORIGIN,
      HARNESS_TEST_MODE: '1',
      NUXT_AUTHENTICATION_SECRET: 'harness-e2e-secret-that-is-long-enough-0123456789',
      NUXT_AUTHENTICATION_BASE_URL: ORIGIN
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
