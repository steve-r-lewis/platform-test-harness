<script setup lang="ts">
/**
 * The host's `IdentityPersonName` (Identity contract, "Names"): replaces
 * Identity's placeholder with Profile's `ProfilePersonName`, which shows the
 * name Profile discloses to the signed-in viewer. On a group's pages the
 * group is the context, so leavers are shown under the group's departure
 * data policy; and those pages are the group's administration, so Profile
 * names a suspended member there to a viewer Authorisation allows
 * (`profile.suspended-people:view`), and to nobody else. Neither layer
 * imports the other: this wrapper connects them.
 */
defineProps<{ identityId: string }>()
const route = useRoute()
const groupId = computed(() => (typeof route.params.groupId === 'string' ? route.params.groupId : null))
</script>

<template>
  <ProfilePersonName
    :identity-id="identityId"
    :group-id="groupId"
    :purpose="groupId ? 'administration' : 'listing'"
  />
</template>
