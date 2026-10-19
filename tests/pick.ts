/**
 * Chooses which browser-test suites to run (tests/suites.ts; README, "Choosing
 * the tests"), then runs them with Playwright. Plain Node (22.18 or later runs
 * TypeScript directly), so it works alike on Windows, macOS and Linux.
 *
 *   pnpm test:pick                       a checklist in a terminal; every suite otherwise
 *   pnpm test:pick --suite iam,theme-manager
 *                                        those suites (and the ones that always run)
 *   pnpm test:pick --all                 every suite
 *   pnpm test:pick --list                the suites, and which changed since they last passed
 *   pnpm test:pick --check               every spec file belongs to exactly one suite (CI)
 *   pnpm test:pick --suite iam -- --headed
 *                                        anything after `--` goes to Playwright
 *
 * The checklist ticks the suites that changed since they last passed here: a
 * layer they exercise moved to another commit or has uncommitted changes, or
 * one of their spec files or the shared test support changed. Changes to the
 * harness's own app and server code are yours to judge. The record is kept in
 * .cache/test-pick.json, on this machine only.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { TEST_SUITES } from './suites.ts'
import type { TestSuite } from './suites.ts'

const harness = resolve(import.meta.dirname, '..')
const recordFile = join(harness, '.cache', 'test-pick.json')
/** Shared by every suite: a change here may change any of them. */
const SHARED = ['playwright.config.ts', 'tests/e2e/prepare-database.mjs', 'tests/e2e/support']

interface PickRecord {
  /** Each suite's fingerprint when it last passed. */
  passed: Record<string, string>
  /** The suites last chosen in the checklist. */
  chosen: string[]
}

const separator = process.argv.indexOf('--')
const ownArguments = separator === -1 ? process.argv.slice(2) : process.argv.slice(2, separator)
const playwrightArguments = separator === -1 ? [] : process.argv.slice(separator + 1)
const { values: options } = parseArgs({
  args: ownArguments,
  options: {
    suite: { type: 'string' },
    all: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false }
  }
})

function fail(message: string): never {
  console.error(`test:pick: ${message}`)
  process.exit(1)
}

function git(cwd: string, args: string[]): string | null {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function digest(...parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex').slice(0, 16)
}

/** Every file's contents under a harness path, in a stable order. */
function contents(path: string): string {
  const full = join(harness, path)
  if (!existsSync(full)) return `${path}: absent`
  if (statSync(full).isFile()) return `${path}\n${readFileSync(full, 'utf8')}`
  const entries = readdirSync(full, { withFileTypes: true, recursive: true })
  return entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
    .map(file => `${file}\n${readFileSync(file, 'utf8')}`)
    .join('\n')
}

const manifest = JSON.parse(readFileSync(join(harness, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>, devDependencies?: Record<string, string> }

/** A layer's version: its package.json spec, or for a local folder its commit and any uncommitted changes. */
function layerVersion(name: string): string {
  const spec = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
  if (!spec) return `${name}: absent`
  if (!spec.startsWith('file:')) return `${name}: ${spec}`
  const folder = resolve(harness, spec.slice('file:'.length))
  const head = git(folder, ['rev-parse', 'HEAD']) ?? 'no commit'
  const changes = git(folder, ['diff', 'HEAD']) ?? ''
  return `${name}: ${head}${changes ? ` + ${digest(changes)}` : ''}`
}

function fingerprint(suite: TestSuite): string {
  return digest(...suite.layers.map(layerVersion), ...suite.files.map(contents), ...SHARED.map(contents))
}

function readRecord(): PickRecord {
  try {
    const record = JSON.parse(readFileSync(recordFile, 'utf8')) as Partial<PickRecord>
    return { passed: record.passed ?? {}, chosen: record.chosen ?? [] }
  } catch {
    return { passed: {}, chosen: [] }
  }
}

function writeRecord(record: PickRecord): void {
  try {
    mkdirSync(join(harness, '.cache'), { recursive: true })
    writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`)
  } catch {
    // A convenience only: never fail a test run over it.
  }
}

// --- --check: every spec file in exactly one suite -----------------------------
function check(): void {
  const problems: string[] = []
  const keys = new Set<string>()
  const owner = new Map<string, string>()
  for (const suite of TEST_SUITES) {
    if (keys.has(suite.key)) problems.push(`two suites are called '${suite.key}'`)
    keys.add(suite.key)
    for (const file of suite.files) {
      if (!existsSync(join(harness, file))) problems.push(`${suite.key}: ${file} does not exist`)
      if (owner.has(file)) problems.push(`${file} is in both '${owner.get(file)}' and '${suite.key}'`)
      owner.set(file, suite.key)
    }
  }
  for (const entry of readdirSync(join(harness, 'tests/e2e'), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) continue
    const file = join(entry.parentPath, entry.name).slice(harness.length + 1).split('\\').join('/')
    if (!owner.has(file)) problems.push(`${file} belongs to no suite: add it to tests/suites.ts`)
  }
  if (problems.length) fail(`\n  ${problems.join('\n  ')}`)
  console.log(`test:pick: ${owner.size} spec files in ${TEST_SUITES.length} suites`)
}

if (options.check) {
  check()
  process.exit(0)
}

// --- Which suites ---------------------------------------------------------------
const record = readRecord()
const changed = new Set(TEST_SUITES.filter(suite => record.passed[suite.key] !== fingerprint(suite)).map(suite => suite.key))
const always = TEST_SUITES.filter(suite => suite.always)
const optional = TEST_SUITES.filter(suite => !suite.always)

if (options.list) {
  for (const suite of TEST_SUITES) {
    const state = changed.has(suite.key) ? 'changed since it last passed' : 'unchanged since it last passed'
    console.log(`${suite.key.padEnd(16)} ${suite.always ? 'always runs' : state.padEnd(30)}  ${suite.label}`)
  }
  process.exit(0)
}

async function choose(): Promise<string[]> {
  if (options.all) return TEST_SUITES.map(suite => suite.key)
  if (options.suite) {
    const asked = options.suite.split(',').map(key => key.trim()).filter(Boolean)
    const unknown = asked.filter(key => !TEST_SUITES.some(suite => suite.key === key))
    if (unknown.length) fail(`no suite called ${unknown.join(', ')}. Suites: ${TEST_SUITES.map(suite => suite.key).join(', ')}`)
    return asked
  }
  // Not in a terminal (CI, a script): every suite, as `pnpm test:e2e` would.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return TEST_SUITES.map(suite => suite.key)

  const prompts = await import('@clack/prompts')
  prompts.intro('Choose the browser tests to run')
  prompts.note(always.map(suite => suite.label).join('\n'), 'Always run')
  const changedOptional = optional.filter(suite => changed.has(suite.key)).map(suite => suite.key)
  const picked = await prompts.multiselect({
    message: 'Also run (ticked: changed since they last passed)',
    options: optional.map(suite => ({
      value: suite.key,
      label: suite.label,
      hint: changed.has(suite.key) ? 'changed' : 'unchanged'
    })),
    initialValues: changedOptional.length ? changedOptional : record.chosen.filter(key => optional.some(suite => suite.key === key)),
    required: false
  })
  if (prompts.isCancel(picked)) {
    prompts.cancel('Nothing run.')
    process.exit(130)
  }
  record.chosen = picked
  return picked
}

const chosen = new Set([...always.map(suite => suite.key), ...await choose()])
const suites = TEST_SUITES.filter(suite => chosen.has(suite.key))
const files = suites.flatMap(suite => suite.files)
console.log(`\nRunning: ${suites.map(suite => suite.key).join(', ')}\n`)

// --- Run them -------------------------------------------------------------------
const cli = createRequire(join(harness, 'package.json')).resolve('@playwright/test/cli')
const run = spawnSync(process.execPath, [cli, 'test', ...files, ...playwrightArguments], { cwd: harness, stdio: 'inherit' })
const status = run.status ?? 1

// Only a whole suite that passed counts: extra Playwright options may have run part of one.
if (status === 0 && playwrightArguments.length === 0) {
  for (const suite of suites) record.passed[suite.key] = fingerprint(suite)
}
writeRecord(record)
process.exit(status)
