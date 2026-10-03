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

Theme Manager is the first integrated layer. Its existing black-box Playwright coverage is retained, including the runtime Theme persistence regression that verifies a saved runtime radius survives fresh consumer navigation through the complete Theme Manager/Tailwind cascade.

Current Theme Manager baseline:

`aa6792ca4418000c21b01c93a90da6c4b44e9e12`

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:e2e
```

For local development:

```bash
pnpm dev
```

## Repository role

This repository is a test consumer, not a reusable layer. Product behaviour and contracts remain owned by their respective layer repositories. Harness-specific adapters and probes exist only to supply host responsibilities and verify public behaviour.
