/**
 * The harness's browser-test suites, named once (README, "Choosing the tests").
 * Every spec file belongs to exactly one suite, which `pnpm test:pick --check`
 * proves (CI runs it). A layer composed later adds a suite here, with the spec
 * files that test it and the layers they exercise; `pnpm test:pick` then offers
 * it and preselects it whenever one of those layers changes.
 *
 * A local choice only: CI always runs every suite, since what the harness
 * exists to catch is one layer breaking another.
 */
export interface TestSuite {
  /** Used on the command line: `pnpm test:pick --suite iam`. */
  key: string
  label: string
  /** Spec files, relative to the harness. */
  files: string[]
  /** The packages whose change makes this suite worth running again. */
  layers: string[]
  /** Runs in every selection: cheap, and catches cross-cutting breakage. */
  always?: boolean
}

export const TEST_SUITES: TestSuite[] = [
  {
    key: 'shell',
    label: 'Shell: composition, sign-in, routes and access',
    files: ['tests/e2e/authentication.spec.ts', 'tests/e2e/routes.spec.ts'],
    layers: ['@nuxt4-layers/authentication', '@nuxt4-layers/theme-manager'],
    always: true
  },
  {
    key: 'iam',
    label: 'IAM suite: processes across Identity, Authentication, Authorisation and Profile',
    files: ['tests/e2e/iam.spec.ts'],
    // The founding procedure, the platform's settings and the tenant export reach the configuration layer too.
    layers: ['@nuxt4-layers/authentication', '@nuxt4-layers/identity', '@nuxt4-layers/authorisation', '@nuxt4-layers/profile', '@nuxt4-layers/iam-integration', '@nuxt4-layers/configuration']
  },
  {
    key: 'settings',
    label: 'Settings: the configuration layer through the IAM suite',
    files: ['tests/e2e/settings.spec.ts'],
    layers: ['@nuxt4-layers/configuration', '@nuxt4-layers/authentication', '@nuxt4-layers/identity', '@nuxt4-layers/authorisation', '@nuxt4-layers/iam-integration']
  },
  {
    key: 'theme-manager',
    label: 'Theme Manager: runtime presentation and Theme editing',
    files: ['tests/e2e/theme-manager.spec.ts'],
    layers: ['@nuxt4-layers/theme-manager']
  }
]
