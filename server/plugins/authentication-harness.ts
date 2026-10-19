import type { AuthenticationEvent, AuthenticationMessage } from '@nuxt4-layers/authentication/contracts'
import type { HarnessMail } from '../utils/harness-mail'

/**
 * Composition root for the Authentication layer: supplies its ports the way a
 * real host would, with harness-only recording adapters.
 *
 * Environment:
 * - HARNESS_DATABASE_URL   PostgreSQL connection string (disposable, never hosted).
 *                          Without it the database port is absent and
 *                          authentication fails closed (503).
 * - HARNESS_TEST_MODE=1    record mail and events for the test probes, skip
 *                          the network compromised-password check.
 * - HARNESS_SMTP_URL       also send mail, to Mailpit from compose.yaml
 *                          (server/utils/harness-mail.ts).
 * - NUXT_AUTHENTICATION_SECRET, NUXT_AUTHENTICATION_BASE_URL (layer config).
 */
export interface HarnessRecorder {
  messages: AuthenticationMessage[]
  events: AuthenticationEvent[]
}

export const harnessTestMode = process.env.HARNESS_TEST_MODE === '1'
export const harnessRecorder: HarnessRecorder = { messages: [], events: [] }

const SUBJECTS: Record<AuthenticationMessage['kind'], string> = {
  'email-verification': 'Confirm your email address',
  'password-reset': 'Reset your password',
  'email-change-confirmation': 'Confirm your new email address',
  'security-notification': 'Security notice for your account'
}

/** Plain-text rendering of the layer's message: a real host brands its own. */
function authenticationMail(message: AuthenticationMessage): HarnessMail {
  const lines = [SUBJECTS[message.kind] + '.']
  if (message.eventType) lines.push(`What happened: ${message.eventType}.`)
  if (message.actionUrl) lines.push('', 'Open this link:', message.actionUrl)
  if (message.expiresAt) lines.push('', `It works once, until ${message.expiresAt}.`)
  lines.push('', 'If this was not you, ignore this message.')
  return { to: message.to, subject: SUBJECTS[message.kind], text: lines.join('\n') }
}

export default defineNitroPlugin(() => {
  const pool = harnessDatabase()
  if (pool) {
    provideAuthenticationDatabase({ dialect: 'postgres', pool })
    migrateAuthenticationDatabase()
  }

  provideAuthenticationMailer({
    async send(message) {
      if (harnessTestMode) harnessRecorder.messages.push(message)
      // Never log actionUrl: it carries a single-use secret.
      console.info(`[harness mailer] ${message.kind} to ${message.to}`)
      await sendHarnessMail(authenticationMail(message))
    }
  })

  provideAuthenticationEventSink({
    async emit(event) {
      if (harnessTestMode) harnessRecorder.events.push(event)
      for (const listener of harnessAuthenticationListeners) await listener(event)
    }
  })

  if (harnessTestMode) {
    provideAuthenticationPolicy({ password: { compromisedCheck: 'disabled' } })
    // The suite's one clock, shared with the IAM members (server/utils/harness-clock.ts).
    provideAuthenticationClock(harnessClock)
  }
})
