import type { AuthenticationEvent, AuthenticationMessage } from '@nuxt4-layers/authentication/contracts'

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
 * - NUXT_AUTHENTICATION_SECRET, NUXT_AUTHENTICATION_BASE_URL (layer config).
 */
export interface HarnessRecorder {
  messages: AuthenticationMessage[]
  events: AuthenticationEvent[]
}

export const harnessTestMode = process.env.HARNESS_TEST_MODE === '1'
export const harnessRecorder: HarnessRecorder = { messages: [], events: [] }

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
  }
})
