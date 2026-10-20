<script setup lang="ts">
/**
 * The platform's founding (README, "The first super administrator"): the
 * person the operator gave a founding code enters it here and becomes the
 * founding owner of the platform group, its super administrator. The server
 * decides everything; this page only reports the answer.
 */
const code = ref('')
const state = ref<'idle' | 'sending' | 'founded' | 'refused' | 'founded-already' | 'failed'>('idle')
const MESSAGES = {
  'refused': 'That code is not valid. It may have been used or have expired: ask the operator for a new one.',
  'founded-already': 'The platform already has its super administrator.',
  'failed': 'The platform could not be founded just now. Ask the operator for a new code and try again.'
} as const

async function found() {
  state.value = 'sending'
  try {
    await $fetch('/api/platform/founding', { method: 'POST', body: { code: code.value.trim() } })
    state.value = 'founded'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    state.value = status === 409 ? 'founded-already' : status === 403 ? 'refused' : 'failed'
  }
}
</script>

<template>
  <UContainer class="max-w-2xl space-y-6 py-12">
    <h1 class="text-3xl font-bold">
      Found the platform
    </h1>
    <div
      v-if="state === 'founded'"
      role="status"
      class="space-y-3"
    >
      <p>You are the platform's super administrator: the founding owner of the platform group.</p>
      <p>
        <NuxtLink
          to="/configuration?scope=platform"
          class="font-semibold underline"
        >
          Open the platform's settings
        </NuxtLink>
      </p>
    </div>
    <template v-else>
      <p>
        Enter the founding code the operator gave you. It makes you the platform's first super administrator,
        who alone may change the application's own settings until others are granted that explicitly.
      </p>
      <p
        v-if="state in MESSAGES"
        role="alert"
        class="font-semibold"
      >
        {{ MESSAGES[state as keyof typeof MESSAGES] }}
      </p>
      <form
        class="space-y-4"
        @submit.prevent="found"
      >
        <UFormField
          label="Founding code"
          name="code"
          required
        >
          <UInput
            v-model="code"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
            required
          />
        </UFormField>
        <UButton
          type="submit"
          label="Found the platform"
          color="neutral"
          :loading="state === 'sending'"
        />
      </form>
    </template>
  </UContainer>
</template>
