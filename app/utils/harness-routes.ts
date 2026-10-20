/**
 * The harness's routing convention (README, "Routes and access"). Every page
 * needs a session signed in at the policy's required level, unless its route
 * is named here: deny by default, so a page a layer or module adds later is
 * protected without anyone remembering to protect it. Routes are named, not
 * matched by path, because hosts may move a layer's pages.
 *
 * Only a user-experience guard: every API enforces access on the server.
 */
const OPEN_ROUTES = new Set([
  'index',
  // Authentication's pages for people not yet signed in. Sign-in and sign-up
  // carry the layer's own `guest` middleware, the second-factor page its
  // `authentication-signed-in` middleware.
  'authentication-signIn',
  'authentication-signUp',
  'authentication-forgotPassword',
  'authentication-resetPassword',
  'authentication-mfa',
  // Opened from links whose secret is in the URL's fragment, which a redirect
  // to sign-in would lose; each page asks the visitor to sign in itself.
  'authentication-breakGlassEnrol',
  'identity-invitation'
])

export type HarnessRouteAccess = 'public' | 'signed-in'

export function harnessRouteAccess(routeName: unknown): HarnessRouteAccess {
  return OPEN_ROUTES.has(String(routeName ?? '')) ? 'public' : 'signed-in'
}

/** The IAM members' and the configuration layer's pages supply their own `<main>` landmark; the shell must not add another. */
const PAGES_WITH_MAIN = ['authentication-', 'identity-', 'authorisation-', 'profile-', 'configuration-']

export function harnessPageOwnsMain(routeName: unknown): boolean {
  const name = String(routeName ?? '')
  return PAGES_WITH_MAIN.some(prefix => name.startsWith(prefix))
}
