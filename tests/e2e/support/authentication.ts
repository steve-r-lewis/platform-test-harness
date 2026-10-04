import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { msLeftInStep, totpCode } from './totp'

/**
 * Black-box helpers: they drive the Authentication layer only through its
 * pages, its HTTP API and the harness's recording mailer.
 */
export const ORIGIN = 'http://localhost:3000'
export const PASSWORD = 'harness passphrase that is long enough'

let sequence = 0
export const freshEmail = () => `harness${++sequence}.${Date.now()}@example.com`

interface Recorder {
  messages: { to: string, kind: string, actionUrl: string | null }[]
  events: { type: string }[]
}

export async function recorder(request: APIRequestContext): Promise<Recorder> {
  return (await request.get('/api/__harness/recorder')).json()
}

export async function lastLink(request: APIRequestContext, to: string, kind: string): Promise<string> {
  await expect.poll(async () => (await recorder(request)).messages.some(m => m.to === to && m.kind === kind)).toBe(true)
  const message = (await recorder(request)).messages.filter(m => m.to === to && m.kind === kind).at(-1)!
  const url = new URL(message.actionUrl!)
  return url.pathname + url.search
}

/** Creates an account and confirms its email address, returning the address. */
export async function verifiedAccount(page: Page): Promise<string> {
  const email = freshEmail()
  const response = await page.request.post('/api/authentication/sign-up', { data: { email, password: PASSWORD }, headers: { origin: ORIGIN } })
  expect(response.status()).toBe(202)
  await page.goto(await lastLink(page.request, email, 'email-verification'))
  return email
}

/** Signs in with the password only (aal1). Lands on the MFA page while MFA is required. */
export async function signInWithPassword(page: Page, email: string, redirect = '/') {
  await page.goto(`/sign-in?redirect=${encodeURIComponent(redirect)}`)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/mfa\?redirect=/)
}

/** Enrols an authenticator app from the MFA page, reaching aal2. */
export async function enrolAuthenticator(page: Page) {
  await page.getByRole('button', { name: 'Use an authenticator app' }).click()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()
  const uri = (await page.getByTestId('totp-key').getAttribute('data-uri'))!
  if (msLeftInStep() < 4_000) await new Promise(resolve => setTimeout(resolve, msLeftInStep() + 200))
  await page.getByLabel('Verification code').fill(totpCode(uri))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeFocused()
  await page.getByRole('button', { name: 'I have saved my backup codes' }).click()
}

/** A fresh account signed in at aal2 (password and authenticator app). */
export async function signInAtAal2(page: Page, redirect = '/') {
  const email = await verifiedAccount(page)
  await signInWithPassword(page, email, redirect)
  await enrolAuthenticator(page)
  return email
}
