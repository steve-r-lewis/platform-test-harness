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
| Authentication | `24d57ae10f05695b84e03da656aaa5cd58b8ff2f` (0.6.0 with the identity port and credential recovery records) |
| Identity | `41dbcf27c75c7da24072938a0ef051bf9b1d59d9` (0.1.0 with permission effects) |
| Authorisation | `dea93792aac7b5d6682a820fd7edd67ab2d9e4c8` (0.3.0, contract 3: view-only paused members) |
| Profile | `137ab99cc8e47ae8f5efb012d0c4ed73d8244a92` (0.3.0, encrypted records, the `/api/profile/*` endpoints, default pages and `ProfilePersonName`) |
| IAM integration | `eb29ef17b5c96afdfa30cc2235df899bd95062d9` (0.1.0, reference adapters; Identity's events forwarded to Profile) |

Theme Manager's existing black-box Playwright coverage is retained, including the runtime Theme persistence regression that verifies a saved runtime radius survives fresh consumer navigation through the complete Theme Manager/Tailwind cascade.

### One database, or none

Both layers use the one disposable PostgreSQL named by `HARNESS_DATABASE_URL` (`server/utils/harness-database.ts`): Authentication through its database port, Theme Manager through a small JSONB `harness_themes` table (`server/plugins/theme-manager-harness.ts`), seeded with the test Theme.

Without `HARNESS_DATABASE_URL` the harness still runs as a demonstration: Theme Manager runs stand-alone on its built-in default Theme (no creating or editing; its pages open without sign-in), and Authentication fails closed (503). The home page states which Theme storage is in use.

### Authentication composition

Authentication is composed as a peer of Theme Manager (`extends` both; neither depends on the other). The harness supplies the host responsibilities:

| Responsibility | Harness adapter |
|---|---|
| Database port | The shared `pg.Pool` from `HARNESS_DATABASE_URL`; migrations applied at start-up (`server/plugins/authentication-harness.ts`) |
| Mailer and event sink | Recorders, readable at `/api/__harness/recorder` only when `HARNESS_TEST_MODE=1` |
| Identity (principal → Theme actor) | A principal at the policy's required level (aal2) becomes the Theme actor; anything else is anonymous (`server/plugins/theme-manager-harness.ts`) |
| Authorization (interim) | Anyone may read and use Themes; only signed-in actors may change them |
| Theme storage | PostgreSQL table in the same database; absent without it, so Theme Manager runs stand-alone |
| Routing | Theme administration requires sign-in when Theme storage exists (`app/middleware/theme-administration.global.ts`); layer pages own their `<main>` landmark (`app/app.vue`) |
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
| Identity's event publisher | The adapters' event handler: Profile's records created, departures kept and records erased; sessions revoked, accounts discarded or deleted, `owner` and membership roles kept in step |
| Profile's subject resolver | Authentication's `getAuthenticatedPrincipal` |
| Profile's disclosure context | Identity's disclosure-context port |
| Profile's key wrapper | Profile's local wrapper over `HARNESS_PROFILE_MASTER_KEY` |
| Identity's `IdentityPersonName` | The harness's own component (`app/components/IdentityPersonName.vue`): names from Profile, as the signed-in viewer may see them, with each page's names batched into one lookup |
| Credential recovery | Authentication's `credentials-recovered` event, and reconciliation from its records every minute |

At start-up the harness migrates Identity and provisions one tenant, every sign-up's home tenant. It relays Identity's and Profile's outboxes every two seconds, runs Identity's maintenance every minute, and re-wraps Profile's keys every minute (a no-op until the master key's version changes). Profile's events have no consumer yet; in test mode they are recorded with Identity's. In test mode, `POST /api/__harness/iam/bootstrap` stands in for the operator's procedure that founds the platform group, `POST /api/__harness/iam/relay` relays at once, and `GET /api/__harness/iam/events` lists the relayed events.

`tests/e2e/iam.spec.ts` follows the processes across the members: provisioning, Authorisation deciding Identity's permissions from roles that follow Identity's owners, Identity's pages through the composition (WCAG 2.2 AA), a paused member viewing but not changing, Profile showing a person's chosen name to a fellow member (through its API and on Identity's group page) and nothing to an outsider, pausing ending sessions, and events carrying opaque identifiers only.

## Run it locally (with sign-in)

Theme administration needs a signed-in account with two factors, and that needs a database. These steps run everything on your machine with a disposable PostgreSQL in Docker.

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/), Node.js 22, pnpm (`corepack enable`), read access to the private `nuxt4-layers` repositories, and an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or 1Password).

1. **Install the dependencies** (once):
   ```bash
   pnpm install
   ```
2. **Start the database:**
   ```bash
   docker compose up -d
   ```
   This starts PostgreSQL 16 on `localhost:5432` with a `harness` database (`compose.yaml`).
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
6. **Confirm the email address:** no email is sent. Open <http://localhost:3000/api/__harness/recorder>, copy the `actionUrl` of the newest `email-verification` message, and open it in the browser.
7. **Sign in:** at <http://localhost:3000/sign-in> with the same email address and password.
8. **Add the second factor:** you are taken to the two-factor page. Choose **Use an authenticator app**, enter your password, scan the QR code with your authenticator app, type the six-digit code, then save the backup codes and confirm.
9. **Open Theme Manager:** select **Theme Manager** in the header. You can now create, edit and save Themes. Next time you only need steps 2, 4 and 7 (with a code from your app).

To stop: press `Ctrl+C` for the harness, then `docker compose down` (add `-v` to delete the database as well).

**Without a database:** remove `HARNESS_DATABASE_URL` from `.env`. Theme Manager then runs stand-alone on its built-in default Theme (no sign-in, nothing to create or edit) and the sign-in pages answer 503.

**Troubleshooting**
- *Port 5432 is already in use:* another PostgreSQL is running. Stop it, or change the first `5432` in `compose.yaml` to `5433` and the port in `HARNESS_DATABASE_URL` to match.
- *The verification link has expired or was used:* sign up again with a different email address and repeat step 6.
- *The six-digit code is refused:* check your phone's clock is set automatically, and enter the code before it changes.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
HARNESS_POSTGRES_URL=postgres://postgres@localhost:5432/postgres pnpm test:e2e
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
