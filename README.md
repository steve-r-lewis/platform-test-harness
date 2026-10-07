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
| Authentication | `a2dfb703371e536c7f735cb51573e40dbfd6ccd6` (0.6.0) |

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

For local development (authentication needs a database and a secret):

```bash
HARNESS_DATABASE_URL=postgres://postgres@localhost:5432/harness \
NUXT_AUTHENTICATION_SECRET="$(openssl rand -base64 48)" \
NUXT_AUTHENTICATION_BASE_URL=http://localhost:3000 \
pnpm dev --host localhost
```

## Repository role

This repository is a test consumer, not a reusable layer. Product behaviour and contracts remain owned by their respective layer repositories. Harness-specific adapters and probes exist only to supply host responsibilities and verify public behaviour.
