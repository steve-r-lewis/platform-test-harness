<script setup lang="ts">
/**
 * The host's `AuthorisationPersonName` (Authorisation contract, presentation):
 * replaces Authorisation's opaque placeholder with Profile's
 * `ProfilePersonName`. Authorisation's pages are a group's administration, so
 * the group is the context and the purpose is `administration`, as on
 * Identity's group pages. Neither layer imports the other: this wrapper
 * connects them.
 */
defineProps<{ principalId: string }>()
const route = useRoute()
const groupId = computed(() => (typeof route.params.groupId === 'string' ? route.params.groupId : null))
</script>

<template>
  <ProfilePersonName
    :identity-id="principalId"
    :group-id="groupId"
    :purpose="groupId ? 'administration' : 'listing'"
  />
</template>
