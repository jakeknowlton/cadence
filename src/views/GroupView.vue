<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/firebase'
import { useGroup, useProfiles } from '@/composables/useGroup'
import { useGroupPeriod } from '@/composables/useGroupPeriod'
import type { Cadence } from '@/types/task'
import type { Completion } from '@/types/completion'
import GroupHeader from '@/components/groups/GroupHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import PeriodGrid from '@/components/groups/PeriodGrid.vue'
import ActivityFeed from '@/components/groups/ActivityFeed.vue'
import CadenceTabs from '@/components/groups/CadenceTabs.vue'

const route = useRoute()
const groupId = computed(() => String(route.params.id))
const { group, activeMembers, versions, today, isTaskArchived, hidden } = useGroup(groupId)
const { nameOf } = useProfiles(() => activeMembers.value.map((m) => m.userId))

const cadence = ref<Cadence>('daily')
const { period, completions, tasks } = useGroupPeriod(groupId, cadence, today, () => group.value?.weekStartsOn ?? 1, versions)

const feedRaw = useCollection<Completion>(
  computed(() => query(collection(db, 'groups', groupId.value, 'completions'), orderBy('loggedAt', 'desc'), limit(60))),
)
const feed = computed(() => feedRaw.value.filter((c) => !c.deletedAt && !isTaskArchived(c.taskId)).slice(0, 40))
const periodLabel = computed(() =>
  period.value.cadence === 'daily' ? 'Today' : period.value.cadence === 'weekly' ? 'This week' : 'This month',
)
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 pt-6 pb-8">
    <EmptyState v-if="hidden" title="This group isn’t available" body="An admin has archived it." />
    <GroupHeader v-else-if="group" :group="group" current="home" />
    <template v-if="group && !hidden">
      <div class="mt-6 flex items-center justify-between gap-3">
        <h2 class="text-xl">{{ periodLabel }}</h2>
        <CadenceTabs v-model="cadence" />
      </div>
      <PeriodGrid class="mt-3" :tasks="tasks" :members="activeMembers" :completions="completions" :period="period" :name-of="nameOf" />

      <h2 class="mt-8 text-xl">Activity</h2>
      <ActivityFeed class="mt-3" :completions="feed" :name-of="nameOf" :versions="versions" />
    </template>
  </section>
</template>
