// Recreates the disposable end-to-end database before the harness starts.
import pg from 'pg'

const admin = new URL(process.env.HARNESS_POSTGRES_URL ?? 'postgres://postgres@localhost:5432/postgres')
const name = new URL(process.env.HARNESS_DATABASE_URL).pathname.slice(1)
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name '${name}'.`)

const client = new pg.Client({ connectionString: admin.toString() })
await client.connect()
try {
  await client.query(`drop database if exists "${name}" with (force)`)
  await client.query(`create database "${name}"`)
} finally {
  await client.end()
}
