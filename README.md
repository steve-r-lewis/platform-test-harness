# Platform Test Harness

Independent Nuxt 4 consumer and integration proving ground for the reusable layers developed under `nuxt4-layers`.

The harness deliberately remains under the `steve-r-lewis` owner so that layers are exercised across the same ownership boundary expected of real consuming applications.

## Verification model

The harness provides three levels of verification:

- **Layer isolation** — exercise each layer through its public contracts and observable behaviour.
- **Layer composition** — detect conflicts between independently developed layers, including CSS vocabulary, middleware/plugin ordering, routes, runtime configuration, ports and dependencies.
- **Platform integration** — preserve proven combinations of layer versions before adoption by real applications and deployment channels.

Layer dependencies are pinned to exact Git commits. CI installs with a frozen lockfile so a passing run identifies a reproducible composition.

## Current baseline

| Layer | Commit |
|---|---|
| Theme Manager | `3f928bcf80bd6e32e0aa991fe0115096a1fe6280` |
| Authentication | `5d18dfcaeb4e18e830a978e7c326bb3c30e6592d` |

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

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
HARNESS_POSTGRES_URL=postgres://postgres@localhost:5432/postgres pnpm test:e2e
```

`HARNESS_POSTGRES_URL` is an admin connection to a **disposable local PostgreSQL**; the suite recreates the `platform_harness_e2e` database on every run. CI uses a service container. Never point it at a hosted database.

Installing needs read access to the private `nuxt4-layers` repositories (`theme-manager` and `authentication`); CI uses the `NUXT4_LAYERS_READ_TOKEN` secret.

For local development (authentication needs a database and a secret):

```bash
HARNESS_DATABASE_URL=postgres://postgres@localhost:5432/harness \
NUXT_AUTHENTICATION_SECRET="$(openssl rand -base64 48)" \
NUXT_AUTHENTICATION_BASE_URL=http://localhost:3000 \
pnpm dev --host localhost
```

## Repository role

This repository is a test consumer, not a reusable layer. Product behaviour and contracts remain owned by their respective layer repositories. Harness-specific adapters and probes exist only to supply host responsibilities and verify public behaviour.
