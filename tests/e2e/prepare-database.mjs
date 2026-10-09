// Recreates the disposable end-to-end database, and Identity's runtime role, before the harness starts.
import pg from 'pg'

const admin = new URL(process.env.HARNESS_POSTGRES_URL ?? 'postgres://postgres@localhost:5432/postgres')
const name = new URL(process.env.HARNESS_DATABASE_URL).pathname.slice(1)
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name '${name}'.`)

const client = new pg.Client({ connectionString: admin.toString() })
await client.connect()
try {
  await client.query(`drop database if exists "${name}" with (force)`)
  // Identity's runtime role owns nothing and can never bypass row-level security (ADR-0006).
  const runtime = new URL(process.env.HARNESS_IDENTITY_DATABASE_URL)
  const role = decodeURIComponent(runtime.username)
  if (!/^[a-z0-9_]+$/.test(role)) throw new Error(`Unexpected role name '${role}'.`)
  await client.query(`drop role if exists "${role}"`)
  await client.query(`create role "${role}" login password '${decodeURIComponent(runtime.password).replaceAll('\'', '\'\'')}' nosuperuser nobypassrls`)
  await client.query(`create database "${name}"`)
} finally {
  await client.end()
}
