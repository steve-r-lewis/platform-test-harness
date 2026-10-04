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
| Theme Manager | `beb8b24ea663ecf88c12685a77a93ca0a9fe12f8` |
| Authentication | `40def423e2f299ce88455fa1139e03e6a5cb2f4c` |

Theme Manager's existing black-box Playwright coverage is retained, including the runtime Theme persistence regression that verifies a saved runtime radius survives fresh consumer navigation through the complete Theme Manager/Tailwind cascade.

### Authentication composition

Authentication is composed as a peer of Theme Manager (`extends` both; neither depends on the other). The harness supplies the host responsibilities:

| Responsibility | Harness adapter |
|---|---|
| Database port | `pg.Pool` from `HARNESS_DATABASE_URL`; migrations applied at start-up (`server/plugins/authentication-harness.ts`) |
| Mailer and event sink | Recorders, readable at `/api/__harness/recorder` only when `HARNESS_TEST_MODE=1` |
| Identity (principal → Theme actor) | A principal at the policy's required level (aal2) becomes the Theme actor; anything else is anonymous (`server/plugins/theme-manager-harness.ts`) |
| Authorization (interim) | Anyone may read and use Themes; only signed-in actors may change them |
| Routing | Theme administration requires sign-in (`app/middleware/theme-administration.global.ts`); layer pages own their `<main>` landmark (`app/app.vue`) |
| Presentation | `app/assets/css/layers.css` recompiles Theme Manager's vocabulary with the Authentication layer's sources, plus a two-token dark-mode palette correction until Theme Manager fixes it |

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
