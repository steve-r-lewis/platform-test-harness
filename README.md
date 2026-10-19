# Platform Test Harness

> **AI-Driven Development**
>
> This repository is part of [Nuxt 4 Layers](https://github.com/nuxt4-layers), an experimental, AI-driven software engineering initiative.
>
> AI performs the principal architecture, development, testing, security assessment and documentation activities under human direction. The project owner retains authority over requirements, governance, acceptance and releases.
>
> **Our objective is to demonstrate that disciplined, specification-led AI development can deliver secure, maintainable, standards-compliant, production-quality open-source software.**
>
> All contributions are subject to the same engineering standards, quality controls and repository policies, regardless of origin. See the [AI development methodology](https://github.com/nuxt4-layers/platform-architecture/blob/master/AI_DEVELOPMENT.md).


Independent Nuxt 4 consumer and integration proving ground for the reusable layers developed under `nuxt4-layers`.

The harness deliberately remains under the `steve-r-lewis` owner so that layers are exercised across the same ownership boundary expected of real consuming applications.

## Verification model

The harness provides three levels of verification:

- **Layer isolation** — exercise each layer through its public contracts and observable behaviour.
- **Layer composition** — detect conflicts between independently developed layers, including CSS vocabulary, middleware/plugin ordering, routes, runtime configuration, ports and dependencies.
- **Platform integration** — preserve proven combinations of layer versions before adoption by real applications and deployment channels.

Layer dependencies are pinned to exact Git commits on each layer's `master`. CI installs with a frozen lockfile so a passing run identifies a reproducible composition.

## Current baseline

| Layer | Commit |
|---|---|
| Theme Manager | `3f928bcf80bd6e32e0aa991fe0115096a1fe6280` |
| Authentication | `08f0f24a3be9e34d9a11f1002ea735c8437fdd70` (0.6.0, phase 8: service identities' client credentials and tokens, beside the identity port, credential recovery records, break-glass accounts and retention) |
| Identity | `0a533d7921ce50f78d01591df10b64b73f9ae51b` (0.1.0, contract 8: service identities, beside approvals, end of life and break-glass) |
| Authorisation | `be59e0a1e54af87c835fcf213addcc0a542bbdf6` (0.4.0, phase 7: service identities never request, decide or approve a change) |
| Profile | `45fa80c6b6f4fd077bc5729f48cc9dc6ac4bceed` (0.4.0, data-subject requests, legal holds, end of life) |
| IAM integration | `69eb3df32eed2a62257e711243976cbc268c1b62` (0.1.0, reference adapters, the service identities process, its governance port and owners' notices) |

Theme Manager's existing black-box Playwright coverage is retained, including the runtime Theme persistence regression that verifies a saved runtime radius survives fresh consumer navigation through the complete Theme Manager/Tailwind cascade.

### One database, or none

Both layers use the one disposable PostgreSQL named by `HARNESS_DATABASE_URL` (`server/utils/harness-database.ts`): Authentication through its database port, Theme Manager through a small JSONB `harness_themes` table (`server/plugins/theme-manager-harness.ts`), seeded with the test Theme.

Without `HARNESS_DATABASE_URL` the harness still runs as a demonstration: Theme Manager applies its built-in default Theme, and Authentication fails closed (503), so nobody can sign in and every page of the signed-in application, Theme Manager's included, sends visitors to the sign-in page. The home page states which Theme storage is in use.

### Authentication composition

Authentication is composed as a peer of Theme Manager (`extends` both; neither depends on the other). The harness supplies the host responsibilities:

| Responsibility | Harness adapter |
|---|---|
| Database port | The shared `pg.Pool` from `HARNESS_DATABASE_URL`; migrations applied at start-up (`server/plugins/authentication-harness.ts`) |
| Mailer and event sink | Recorders, readable at `/api/__harness/recorder` only when `HARNESS_TEST_MODE=1`; with `HARNESS_SMTP_URL` the mail is also sent, through nodemailer, to Mailpit from `compose.yaml` (`server/utils/harness-mail.ts`). The browser tests read the recorder and send nothing (`HARNESS_SMTP_URL=off`) |
| Identity (principal → Theme actor) | A principal at the policy's required level (aal2) becomes the Theme actor; anything else is anonymous (`server/plugins/theme-manager-harness.ts`) |
| Authorization (interim) | Anyone may read and use Themes; only signed-in actors may change them |
| Theme creation owner | The signed-in person: Theme Manager takes a new Theme's owner from public runtime config, which the harness keeps in step with the principal in the browser (`app/plugins/theme-creation-owner.client.ts`) |
| Theme storage | PostgreSQL table in the same database; absent without it, so Theme Manager runs stand-alone |
| Routing | Deny by default: every page needs a session at the policy's required level unless named public (`app/utils/harness-routes.ts`, enforced by `app/middleware/access.global.ts`); see [Routes and access](#routes-and-access) |
| Presentation | None. Theme Manager supplies the semantic vocabulary and its values; the harness writes no CSS for the layers |

`tests/e2e/authentication.spec.ts` covers composition conflicts (routes, styling beside Nuxt UI, landmarks, headers, WCAG 2.2 AA in both modes), the principal-to-actor mapping (anonymous, aal1 and signed-out sessions cannot change Themes), and negative paths across the boundary (cross-origin requests, forged session cookies, secrets in events).

### IAM suite composition

Identity, Authentication, Authorisation and Profile are composed as peers and connected only through `@nuxt4-layers/iam-integration`'s reference adapters (`server/plugins/iam-harness.ts`); no member imports another. It runs when `HARNESS_IDENTITY_DATABASE_URL` is set as well: Identity's runtime role, which owns nothing and cannot bypass row-level security, in the same database. `HARNESS_DATABASE_URL`'s role migrates every schema and serves as Identity's operator.

Profile joins when `HARNESS_PROFILE_DATABASE_URL` (its own runtime role, which owns nothing) and `HARNESS_PROFILE_MASTER_KEY` (32 bytes, base64: wraps each person's data key, standing in for a KMS) are set too, with `NUXT_PROFILE_BASE_URL`. The browser tests generate a fresh master key for each run.

| Port | Supplied by |
|---|---|
| Authentication's identity port | Identity's provisioning port: Identity issues every account's identifier, and its standing gates sign-in and every request |
| Identity's subject resolver | Authentication's `getAuthenticatedPrincipal` |
| Identity's access decision and approval policy | Authorisation's `authorise`, `authorisationQualifies` and `countAuthorisationQualifying` |
| Authorisation's directory | Identity's directory (`paused` passed through: view-only under Authorisation contract 3) |
| Authorisation's catalogue and roles | Identity's permissions, named in the `owner` and `administrator` roles |
| Identity's event publisher | The adapters' event handler: Profile's records created, departures kept and records erased (unless held); sessions revoked, accounts discarded or deleted, Authorisation's principal erased on closure (unless held), `owner` and membership roles kept in step |
| Profile's subject resolver | Authentication's `getAuthenticatedPrincipal` |
| Profile's disclosure context | Identity's disclosure-context port |
| Profile's key wrapper | Profile's local wrapper over `HARNESS_PROFILE_MASTER_KEY` |
| Profile's request coordinator | `profileRequestCoordinatorFromMembers` over Identity's, Authentication's and Authorisation's exports |
| Profile's access decision | `profileAccessDecisionFromAuthorisation` over `authorise`, with Profile's permission in Authorisation's catalogue and roles |
| Profile's notifier | The harness's own: records verification codes in test mode, sends email ones to Mailpit with `HARNESS_SMTP_URL`, and logs neither the address nor the code |
| Profile's `ProfileGroupName` | The harness's own component (`app/components/ProfileGroupName.vue`): the names of groups a person left, from Identity's `GET /api/identity/me` |
| Identity's `IdentityPersonName` | The harness's own component (`app/components/IdentityPersonName.vue`): names from Profile, as the signed-in viewer may see them, with each page's names batched into one lookup; on a group's pages as an administration listing, so the group's administrators see suspended members |
| Credential recovery | Authentication's `credentials-recovered` event, and reconciliation from its records every minute |
| Invitations | The harness's `POST /api/invitations`, through `invitationSenderFromIdentity`: Identity issues an invitation bound to nobody, and the harness's delivery records the link in test mode and sends it to Mailpit with `HARNESS_SMTP_URL`, logging neither the address nor the link |
| Break-glass rotation | The adapters' event handler on `break-glass.used`: Authentication's `rotateAuthenticationBreakGlass`, the new enrolment link to the platform's operators (recorded in test mode) |
| Authorisation's governance and subject resolver | `authorisationGovernanceFromIdentity` over Identity's `getIdentityAccessGovernance()`; Authentication's principal through the subject adapter |
| Authorisation's outbox, maintenance and default roles | Relayed with Identity's and Profile's, maintenance every minute, and each group's default roles (`authorisationDefaultRoles`) on `membership.added` |
| Authorisation's `AuthorisationPersonName` | The harness's own component (`app/components/AuthorisationPersonName.vue`): Profile's names, as on Identity's group pages |
| A stand-in domain capability | `harness-notes:view` (low), `:edit` (medium) and `:delete` (critical) in Authorisation's catalogue, so that resources can be shared |
| Group and tenant disposal | The adapters' event handler on `group.deleted`, `group.disposal-due`, `tenant.closed` and `tenant.disposal-due` (when Identity says disposal is due): Authorisation's `disposeAuthorisationGroup` and `disposeAuthorisationTenant`, and Profile's own disposal through `applyProfileIdentityEvent` |
| Disposal confirmations | `createDisposalConfirmationHandler` over Authorisation's and Profile's relayed events, to Identity's `recordIdentityDisposal`; Identity's `disposalParticipants` names Authorisation and, when composed, Profile |
| Authorisation's and Authentication's legal holds | `legalHoldsFromMembers` with each one's part: Identity's holds on groups and tenants, Profile's on people |
| Authentication's maintenance | `runAuthenticationMaintenance` every minute: its retention schedules (expired sessions and tokens, and credential-recovery records no hold covers) |
| Tenant governance export | The harness's `GET /api/tenants/:tenantId/export`, through `tenantExportFromMembers`: Identity decides who may have it (an owner of a root group of a closing tenant, at `aal2`), then Authorisation adds its part; nothing keeps it |
| Service identities | Authentication's service-governance port from `authenticationServiceGovernanceFromIdentity` over Identity's `getIdentityServiceIdentities()`; `createServiceCredentialNoticeHandler` on Authentication's events tells the owning group's owners of each credential issued, revoked or expiring (recorded in test mode, logging no identifier); suspension and closure reach Authentication through the adapters' event handler |
| The clock | In test mode one clock for every member (`server/utils/harness-clock.ts`), which a probe moves forward; otherwise none, so every member uses the system clock |

At start-up the harness migrates Identity and provisions one tenant, every sign-up's home tenant. It relays Identity's and Profile's outboxes every two seconds, runs Identity's maintenance every minute, re-wraps Profile's keys every minute (a no-op until the master key's version changes), and runs Profile's maintenance every minute. Profile's events go to iam-integration's Profile event handler (erasures a legal hold deferred); in test mode they are recorded with Identity's. In test mode, `POST /api/__harness/iam/bootstrap` stands in for the operator's procedure that founds the platform group, `POST /api/__harness/iam/relay` relays at once, `GET /api/__harness/iam/events` lists the relayed events, `GET /api/__harness/iam/codes` lists the verification codes Profile asked to send, and `GET /api/__harness/iam/invitations` the invitation links delivered. `POST /api/__harness/clock` moves the suite's clock forward (never back), and `POST /api/__harness/iam/maintenance` runs every member's maintenance at once, so safety periods, delays, grace periods and holds can pass in a test. `POST /api/__harness/iam/legal-holds` and `.../legal-holds/release` stand in for the operator placing and releasing a legal hold, `GET /api/__harness/iam/holdings` shows what each member still holds for an identity through its own export, `POST /api/__harness/iam/tenants` stands in for the operator provisioning a tenant and its first root group, `GET /api/__harness/iam/disposal` shows Identity's record of a group's or tenant's disposal, and `POST /api/__harness/iam/break-glass`, `GET .../break-glass/links` and `POST .../break-glass/review` stand in for the operator's break-glass provisioning, the operators' inbox and the review procedure. `GET /api/__harness/iam/service-notices` lists the service-credential notices delivered to owners. A real host exposes none of these.

`tests/e2e/iam.spec.ts` follows the processes across the members: provisioning, Authorisation deciding Identity's permissions from roles that follow Identity's owners, Identity's pages through the composition (WCAG 2.2 AA), a paused member viewing but not changing, Profile showing a person's chosen name to a fellow member (through its API and on Identity's group page) and nothing to an outsider, pausing ending sessions, and events carrying opaque identifiers only. With the suite's clock it follows the remaining processes' acceptance tests: invitations (one answer for any address, single use, revoked and expired links, a forwarded guest link awaiting confirmation, end dates in effect before maintenance), leaving, approvals (the parent-owner fallback, a raised requirement, refusals of the requester, the beneficiary, a changed change, a lapsed approver and a self-grant, published delays, safety periods and their risk treatment), recovery (step-up and the recovery hold after a password reset, an orphaned group's delay, and an objection), account closure (cancellation, erasure across every member and signing up afresh, and a legal hold keeping Authentication's part until released) break-glass access (one-time enrolment, passkey-only, its limits, rotation after use and the review by another operator), and access administration (a role's risk deciding its approval, the parent-owner fallback, the descendants scope, owners following Identity, no self-grant, sharing from one's personal group at the permission's assurance, default roles, a time-limited role ending before maintenance, an overdue access review, a custom role defined only by the root group's owners, and Authorisation's group access page with Profile's names under WCAG 2.2 AA), service identities (created with approval and renamed; a secret issued only by someone who may manage it after a passkey sign-in within fifteen minutes, its owners told; a token from the client-credentials grant acting only within the memberships an approved join gives, never requesting a change or becoming an owner; two credentials at most, revoking one ending its tokens at once; suspension refusing its very next request, reinstatement, and closure deleting its credentials; no secret or token in any event or notice), and end of life (an archived group deleted with approval and conferring nothing at once, its disposal confirmed by every member, a group under legal hold kept until the hold is released; a tenant's shutdown approved only by a platform operator, its governance export during the notice, and every group in it deleted and disposed of at its end; retention announced with counts only).

## Routes and access

The harness stands in for the final application, so its pages follow one convention, which every module added later follows too.

- **Deny by default.** Every page needs a session signed in at the policy's required level (both factors while MFA is required), unless its route is named in `app/utils/harness-routes.ts`. A page a layer or module adds is therefore protected without anyone protecting it, and so is a path nothing serves. Routes are named, not matched by path, because hosts may move a layer's pages.
- **Public routes.** Only these are public:
  - the home page;
  - Authentication's pages for people not yet signed in (sign-in, sign-up, forgotten and reset password, and the second-factor page, which keeps its own guard);
  - the two pages opened from links whose secret is in the URL's fragment: break-glass enrolment and accepting an invitation. A redirect to sign-in would lose the secret, so these pages ask the visitor to sign in themselves.
- **One guard.** `app/middleware/access.global.ts` sends anonymous visitors to sign-in and password-only sessions to the second-factor page, each with `redirect` set to the page they asked for. It reads the session again at every navigation into the signed-in application, so a session that ended elsewhere is noticed at once.
- **The guard is not the security boundary.** It only shapes the user experience: every API still enforces access on the server.
- **Two shells.** A fully signed-in session gets the signed-in application: the modules menu beside the page (in the header's menu on small screens) and the account menu (Security, Sign out). Everything else gets the public shell, which offers sign-in and sign-up. Layer pages supply their own `<main>` landmark; the shell adds one only for pages that do not (`app/layouts/`).
- **One menu.** The modules are listed once, in `app/utils/harness-modules.ts`. A new module adds an entry there and needs no guard of its own.

`tests/e2e/routes.spec.ts` proves the convention:
- anonymous visitors are sent to sign-in from a page of every layer and from an unknown path;
- a password-only session is sent to the second factor;
- once signed in, every module opens from the menu, each page with one main landmark;
- a session ended in another tab is noticed at the next navigation;
- signing out leaves the signed-in application.

## Choosing the tests

As more layers are composed, the browser suite grows, and a change usually needs only part of it run again. The suites are named once in `tests/suites.ts`. Each entry gives the suite's spec files and the layers they exercise.

| Suite | Spec files | Runs |
|---|---|---|
| `shell` | `authentication.spec.ts`, `routes.spec.ts` | Always: composition, sign-in, routes and access, which every change can break |
| `iam` | `iam.spec.ts` | When chosen |
| `theme-manager` | `theme-manager.spec.ts` | When chosen |

```bash
pnpm test:pick                         # a checklist in a terminal (space ticks, enter runs)
pnpm test:pick --suite iam             # those suites, and the ones that always run
pnpm test:pick --all                   # every suite
pnpm test:pick --list                  # the suites, and which changed since they last passed
pnpm test:pick --suite iam -- --headed # anything after -- goes to Playwright
```

**What the checklist ticks:** the suites that changed since they last passed on this machine. A suite counts as changed when:
- a layer it exercises is at another commit, or has uncommitted changes (when composed from a local folder);
- one of its spec files changed;
- the shared test support changed (`tests/e2e/support/`, the database preparation, `playwright.config.ts`).

Changes to the harness's own app and server code are yours to judge. The record is kept in `.cache/test-pick.json`, which is not committed. A run counts only when it passes and no extra Playwright options were given, since those may have run only part of a suite.

**Outside a terminal** (a script or CI), `pnpm test:pick` with no options runs every suite. **CI** always runs every suite with `pnpm test:e2e`, because one layer breaking another is what the harness exists to catch. CI also runs `pnpm test:pick --check`, which fails when a spec file belongs to no suite or to two.

**Adding a layer:** add its spec files and a suite entry naming them and the layers they exercise.

## Run it locally (with sign-in)

Theme administration needs a signed-in account with two factors, and that needs a database. These steps run everything on your machine with a disposable PostgreSQL in Docker.

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/), Node.js 22, pnpm (`corepack enable`), read access to the private `nuxt4-layers` repositories, and an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or 1Password).

1. **Install the dependencies** (once):
   ```bash
   pnpm install
   ```
2. **Start the database and the mail catcher:**
   ```bash
   docker compose up -d
   ```
   This starts PostgreSQL 16 on `localhost:5432` with a `harness` database, and [Mailpit](https://mailpit.axllent.org/), which catches every message the harness sends: read them at <http://localhost:8025>. Nothing is delivered beyond it (`compose.yaml`).
3. **Create your settings file** (once):
   ```bash
   cp .env.example .env
   ```
   Open `.env` and replace the `NUXT_AUTHENTICATION_SECRET` value with any random text of at least 32 characters (for example the output of `openssl rand -base64 48`).
4. **Start the harness:**
   ```bash
   pnpm dev --host localhost
   ```
   Open <http://localhost:3000> (use `localhost`, not `127.0.0.1`). The first visit to each page is slow while it compiles.
5. **Create an account:** go to <http://localhost:3000/sign-up> and enter an email address (it does not need to be real) and a password of at least 15 characters.
6. **Confirm the email address:** open Mailpit at <http://localhost:8025>, open the **Confirm your email address** message and follow its link. (Without `HARNESS_SMTP_URL`, nothing is sent: copy the `actionUrl` of the newest `email-verification` message at <http://localhost:3000/api/__harness/recorder> instead.)
7. **Sign in:** at <http://localhost:3000/sign-in> with the same email address and password.
8. **Add the second factor:** you are taken to the two-factor page. Choose **Use an authenticator app**, enter your password, scan the QR code with your authenticator app, type the six-digit code, then save the backup codes and confirm.
9. **Open Theme Manager:** select **Theme Manager** in the header. You can now create, edit and save Themes. Next time you only need steps 2, 4 and 7 (with a code from your app).

To stop: press `Ctrl+C` for the harness, then `docker compose down` (add `-v` to delete the database as well).

**Without a database:** remove `HARNESS_DATABASE_URL` from `.env`. The home page then shows Theme Manager's built-in default Theme; the sign-in pages answer 503, so the signed-in application cannot be opened.

**Troubleshooting**
- *Port 5432 is already in use:* another PostgreSQL is running. Stop it, or change the first `5432` in `compose.yaml` to `5433` and the port in `HARNESS_DATABASE_URL` to match.
- *No message in Mailpit:* check `HARNESS_SMTP_URL=smtp://localhost:1025` is in `.env` and Mailpit is running (`docker compose up -d`); the harness warns `[harness mailer] not sent` when it cannot reach it. Restart `pnpm dev` after changing `.env`.
- *The verification link has expired or was used:* sign up again with a different email address and repeat step 6.
- *The six-digit code is refused:* check your phone's clock is set automatically, and enter the code before it changes.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
HARNESS_POSTGRES_URL=postgres://postgres@localhost:5432/postgres pnpm test:e2e
HARNESS_POSTGRES_URL=postgres://postgres@localhost:5432/postgres pnpm test:pick   # choose the suites
```

`HARNESS_POSTGRES_URL` is an admin connection to a **disposable local PostgreSQL**; the suite recreates the `platform_harness_e2e` database on every run. CI uses a service container. Never point it at a hosted database.

Installing needs read access to the private `nuxt4-layers` repositories (`theme-manager` and `authentication`); CI uses the `NUXT4_LAYERS_READ_TOKEN` secret.

For local development (authentication needs a database and a secret; the IAM suite also needs Identity's and Profile's runtime roles, created once with `create role harness_identity_runtime login password '…' nosuperuser nobypassrls` and likewise `harness_profile_runtime`):

```bash
HARNESS_DATABASE_URL=postgres://postgres@localhost:5432/harness \
HARNESS_IDENTITY_DATABASE_URL=postgres://harness_identity_runtime:…@localhost:5432/harness \
NUXT_IDENTITY_BASE_URL=http://localhost:3000 \
HARNESS_PROFILE_DATABASE_URL=postgres://harness_profile_runtime:…@localhost:5432/harness \
HARNESS_PROFILE_MASTER_KEY="<32 random bytes, base64; keep it>" \
NUXT_PROFILE_BASE_URL=http://localhost:3000 \
NUXT_AUTHENTICATION_SECRET="$(openssl rand -base64 48)" \
NUXT_AUTHENTICATION_BASE_URL=http://localhost:3000 \
pnpm dev --host localhost
```

## Repository role

This repository is a test consumer, not a reusable layer. Product behaviour and contracts remain owned by their respective layer repositories. Harness-specific adapters and probes exist only to supply host responsibilities and verify public behaviour.
