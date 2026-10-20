/**
 * The disposable end-to-end database (playwright.config.ts): HARNESS_POSTGRES_URL
 * is an admin connection (default: a local server), and the suite recreates
 * `platform_harness_e2e` on it each run.
 */
export function e2eDatabaseUrl(): URL {
  const database = new URL(process.env.HARNESS_POSTGRES_URL ?? 'postgres://postgres@localhost:5432/postgres')
  database.pathname = '/platform_harness_e2e'
  return database
}
