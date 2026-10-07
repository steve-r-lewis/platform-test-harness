import pg from 'pg'

let pool: pg.Pool | null | undefined

/**
 * The harness's one PostgreSQL pool, shared by both layers' adapters, from
 * HARNESS_DATABASE_URL (disposable, never hosted). Null without it: the
 * Authentication layer then fails closed (503) and Theme Manager runs stand-alone
 * on its built-in default Theme.
 */
export function harnessDatabase(): pg.Pool | null {
  if (pool === undefined) {
    const connectionString = process.env.HARNESS_DATABASE_URL
    pool = connectionString ? new pg.Pool({ connectionString, max: 5 }) : null
  }
  return pool
}
