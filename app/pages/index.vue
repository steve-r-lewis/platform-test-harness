<script setup lang="ts">
const { storage } = await useThemeCapabilities()
const checks = computed(() => [
  'Theme Manager layer composes through its package root',
  'Bundled semantic presentation stylesheet is active',
  storage.value
    ? 'Theme storage: PostgreSQL through HARNESS_DATABASE_URL'
    : 'Theme storage: none, so Theme Manager runs stand-alone on its built-in default Theme',
  'Host-provided actor and Authorization adapters are available',
  'Theme Manager administration routes are supplied by the layer'
])
</script>

<template>
  <UContainer class="py-12 space-y-10">
    <div class="space-y-4">
      <UBadge
        label="Integration harness"
        variant="subtle"
      />
      <h1 class="text-4xl font-bold">
        Theme Manager black-box test application
      </h1>
      <p class="max-w-3xl text-lg text-muted">
        This application consumes Theme Manager as an independent Nuxt layer. It deliberately keeps
        persistence, identity and authorization adapters minimal so integration failures remain easy to isolate.
      </p>
      <div class="flex gap-3">
        <UButton
          to="/theme-manager"
          label="Open Theme Library"
          icon="i-lucide-palette"
        />
        <UButton
          v-if="storage"
          to="/theme-manager/new"
          label="Create Theme"
          variant="outline"
          icon="i-lucide-plus"
        />
      </div>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          Composition checks
        </h2>
      </template>

      <ul class="space-y-3">
        <li
          v-for="check in checks"
          :key="check"
          class="flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-circle-check"
            class="size-5 text-success"
          />
          <span>{{ check }}</span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          Tailwind presentation probe
        </h2>
      </template>

      <p class="mb-5 text-muted">
        These controls consume Theme Manager through its Tailwind vocabulary. Select the seeded
        <strong>Harness Test Theme</strong> in the Theme Library and return here to observe runtime changes
        through the complete default → API → Tailwind cascade.
      </p>

      <div class="flex flex-wrap gap-4">
        <button
          data-testid="theme-probe"
          class="rounded-lg px-5 py-3 bg-fill-primary-default text-pen-primary-default font-sans text-base font-bold shadow-sm-primary hover:bg-fill-primary-hover hover:text-pen-primary-hover"
        >
          Default
        </button>
        <button
          data-testid="theme-probe-hover"
          class="rounded-lg px-5 py-3 bg-fill-primary-hover text-pen-primary-hover font-sans text-base font-bold shadow-sm-primary"
        >
          Hover probe
        </button>
        <div
          data-testid="theme-probe-effects"
          class="w-xs max-w-full rounded-xl p-4 shadow-md-primary font-serif text-lg text-shadow-sm-primary"
        >
          Runtime presentation probe
        </div>
      </div>
    </UCard>

    <UAlert
      title="Deliberately minimal adapters"
      description="The repository is in-memory and resets when the Nitro server restarts. The test actor is test-user and the harness authorization adapter permits that actor. This is intentional: the harness tests Theme Manager integration, not infrastructure."
      icon="i-lucide-flask-conical"
      color="neutral"
      variant="subtle"
    />
  </UContainer>
</template>
