<script setup lang="ts">
/**
 * The host's `ProfileGroupName` (Profile contract §13): Profile holds no
 * group names, so its departures page asks for each group the person left by
 * Identity's identifier; this names it from Identity's own view of the
 * person (`formerGroupNames`), falling back to Profile's wording. Neither
 * layer imports the other: this wrapper connects them.
 */
const props = defineProps<{ groupId: string }>()
const { t } = useProfileText()
const { data: me } = await useAsyncData('harness-identity-me', () => useIdentity().me())
const name = computed(() => me.value?.formerGroupNames.find(group => group.groupId === props.groupId)?.name ?? null)
</script>

<template>
  <span :data-group-id="groupId">{{ name ?? t('profile.group.unnamed') }}</span>
</template>
