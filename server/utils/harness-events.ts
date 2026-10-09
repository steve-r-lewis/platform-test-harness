import type { AuthenticationEvent } from '@nuxt4-layers/authentication/contracts'

/**
 * Listeners for Authentication's events beyond the harness recorder: the IAM
 * composition passes credential recoveries to Identity. Authentication's sink
 * is one port, supplied once (`server/plugins/authentication-harness.ts`).
 */
export const harnessAuthenticationListeners: ((event: AuthenticationEvent) => Promise<void>)[] = []
