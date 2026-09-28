<script setup lang="ts">
const checks = [
  'Theme Manager layer composes through its package root',
  'Bundled semantic presentation stylesheet is active',
  'Host-provided in-memory ThemeRepository is available',
  'Host-provided actor and Authorization adapters are available',
  'Theme Manager administration routes are supplied by the layer'
]
</script>

<template>
  <UContainer class="py-12 space-y-10">
    <div class="space-y-4">
      <UBadge label="Integration harness" variant="subtle" />
      <h1 class="text-4xl font-bold">
        Theme Manager black-box test application
      </h1>
      <p class="max-w-3xl text-lg text-muted">
        This application consumes Theme Manager as an independent Nuxt layer. It deliberately keeps
        persistence, identity and authorization adapters minimal so integration failures remain easy to isolate.
      </p>
      <div class="flex gap-3">
        <UButton to="/theme-manager" label="Open Theme Library" icon="i-lucide-palette" />
        <UButton to="/theme-manager/new" label="Create Theme" variant="outline" icon="i-lucide-plus" />
      </div>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          Composition checks
        </h2>
      </template>

      <ul class="space-y-3">
        <li v-for="check in checks" :key="check" class="flex items-center gap-2">
          <UIcon name="i-lucide-circle-check" class="size-5 text-success" />
          <span>{{ check }}</span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">
          Semantic presentation probe
        </h2>
      </template>

      <p class="mb-5 text-muted">
        These controls consume Theme Manager's semantic presentation variables. Select the seeded
        <strong>Harness Test Theme</strong> in the Theme Library and return here to observe runtime changes.
      </p>

      <div class="flex flex-wrap gap-4">
        <button class="theme-probe">
          Default
        </button>
        <button class="theme-probe theme-probe-hover">
          Hover probe
        </button>
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

<style scoped>
.theme-probe {
  border-radius: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--api-fill-primary-default);
  color: var(--api-pen-primary-default);
  box-shadow: var(--api-fill-primary-shadow);
}

.theme-probe:hover,
.theme-probe-hover {
  background: var(--api-fill-primary-hover);
  color: var(--api-pen-primary-hover);
}
</style>
