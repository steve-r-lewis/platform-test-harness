<script setup lang="ts">
import type { DisplayName } from '@nuxt4-layers/profile/contracts'
import { UUID_V7_PATTERN } from '@nuxt4-layers/profile/contracts'

/**
 * The host's `IdentityPersonName` (Identity contract, "Names"): replaces
 * Identity's placeholder with the name Profile discloses to the signed-in
 * viewer. On a group's pages the group is the context, so leavers are shown
 * under the group's departure data policy. Until the name arrives, and when
 * Profile shows nothing, it reads "Member".
 */
const props = defineProps<{ identityId: string }>()
const route = useRoute()
const { displayName } = useProfileNames()
const name = ref<DisplayName>({ kind: 'hidden' })

const groupId = computed(() => {
  const value = route.params.groupId
  return typeof value === 'string' && UUID_V7_PATTERN.test(value) ? value : null
})

onMounted(() => {
  watch([() => props.identityId, groupId], async ([identityId, group]) => {
    name.value = { kind: 'hidden' }
    const answer = await displayName(identityId, group, 'listing')
    if (identityId === props.identityId) name.value = answer
  }, { immediate: true })
})

const label = computed(() => {
  switch (name.value.kind) {
    case 'name': return name.value.value
    case 'pseudonym': return `Former member ${name.value.number}`
    case 'former-member': return 'Former member'
    default: return 'Member'
  }
})
</script>

<template>
  <span
    :title="identityId"
    :data-identity-id="identityId"
  >{{ label }}</span>
</template>
