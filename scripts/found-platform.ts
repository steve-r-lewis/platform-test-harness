// The operator's step in founding the platform (README, "The first super
// administrator"): issues a one-time code for the person who is to be the
// platform's first super administrator, to redeem at /platform/founding once
// signed in. Start the harness once first, so Identity's schema exists.
//
//   HARNESS_DATABASE_URL=postgres://… node scripts/found-platform.ts
import pg from 'pg'
import { FOUNDING_CODE_MINUTES, issuePlatformFoundingCode } from '../server/utils/platform-founding.ts'

const url = process.env.HARNESS_DATABASE_URL
if (!url) {
  console.error('Set HARNESS_DATABASE_URL to the harness database (the migration role).')
  process.exit(2)
}
const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  const { code, expiresAt } = await issuePlatformFoundingCode(pool)
  console.log(`Founding code (works once, for ${FOUNDING_CODE_MINUTES} minutes, until ${expiresAt}):`)
  console.log(code)
  console.log('Give it only to the person who is to be super administrator. They sign in and enter it at /platform/founding.')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
