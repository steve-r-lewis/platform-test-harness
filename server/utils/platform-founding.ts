import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'

/**
 * The platform's first super administrator (README, "The first super
 * administrator"). The operator issues a one-time founding code with
 * `node scripts/found-platform.ts`; the person who is to be super
 * administrator signs in and redeems it at `/platform/founding`, which makes
 * them the founding owner of the platform group (Identity's
 * `bootstrapIdentityRootGroup`). Owners of the platform group alone hold the
 * critical permissions, among them changing the hosting application's own
 * settings; anyone else needs an explicit, approved grant.
 *
 * Only the code's SHA-256 digest is stored, with an expiry; one code is
 * outstanding at a time, it works once, and none is issued or redeemed once
 * the platform group exists. Imported by the script too, so it imports only
 * Node and pg.
 */

export const FOUNDING_CODE_MINUTES = 60

const digestOf = (code: string) => createHash('sha256').update(code).digest('hex')

async function ensureTable(pool: pg.Pool): Promise<void> {
  await pool.query('create table if not exists harness_platform_founding (digest text primary key, expires_at timestamptz not null)')
}

/** Whether the default tenant (the first) has its first root group: the platform group. */
export async function platformFounded(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query(`
    select 1 from identity."group" g
    where g.tenant_id = (select tenant_id from identity.tenant order by created_at limit 1)
      and g.parent_group_id is null and g.kind = 'standard'
    limit 1`)
  return rows.length > 0
}

/** Issues a new code, replacing any outstanding one. Refused once the platform group exists. */
export async function issuePlatformFoundingCode(pool: pg.Pool): Promise<{ code: string, expiresAt: string }> {
  if (await platformFounded(pool)) throw new Error('The platform already has its super administrator.')
  await ensureTable(pool)
  const code = randomBytes(24).toString('base64url')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from harness_platform_founding')
    const { rows } = await client.query<{ expiresAt: Date }>(
      `insert into harness_platform_founding (digest, expires_at) values ($1, now() + make_interval(mins => $2)) returning expires_at as "expiresAt"`,
      [digestOf(code), FOUNDING_CODE_MINUTES]
    )
    await client.query('commit')
    return { code, expiresAt: rows[0]!.expiresAt.toISOString() }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Consumes the code if it is outstanding and unexpired. Whatever happens next, it never works again. */
export async function redeemPlatformFoundingCode(pool: pg.Pool, code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !/^[\w-]{16,64}$/.test(code)) return false
  await ensureTable(pool)
  const { rowCount } = await pool.query('delete from harness_platform_founding where digest = $1 and expires_at > now()', [digestOf(code)])
  return (rowCount ?? 0) > 0
}
