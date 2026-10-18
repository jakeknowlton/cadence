<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue'
import { useGroup, useProfiles } from '@/composables/useGroup'
import { useGroupPeriod } from '@/composables/useGroupPeriod'
import type { Cadence } from '@/types/task'
import { periodFor, shiftDays } from '@/lib/periods'
import GroupHeader from '@/components/groups/GroupHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import PeriodGrid from '@/components/groups/PeriodGrid.vue'
import CadenceTabs from '@/components/groups/CadenceTabs.vue'
import { Button } from '@/components/ui/button'

const route = useRoute()
const groupId = computed(() => String(route.params.id))
const { group, members, versions, today, hidden } = useGroup(groupId)
const { nameOf } = useProfiles(() => members.value.map((m) => m.userId))

const cadence = ref<Cadence>('daily')
const date = ref(today.value)
watch(today, (t, prev) => {
  if (date.value === prev) date.value = t
})
watch(cadence, () => (date.value = today.value))

const weekStartsOn = computed(() => group.value?.weekStartsOn ?? 1)
const { period, completions, tasks } = useGroupPeriod(groupId, cadence, date, weekStartsOn, versions)

function step(dir: -1 | 1) {
  const p = periodFor(date.value, cadence.value, weekStartsOn.value)
  date.value = dir === 1 ? shiftDays(p.end, 1) : shiftDays(p.start, -1)
}
const isCurrent = computed(() => period.value.key === periodFor(today.value, cadence.value, weekStartsOn.value).key)
const label = computed(() => {
  const p = period.value
  if (p.cadence === 'daily') return new Date(`${p.start}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (p.cadence === 'weekly') return `${p.start} – ${p.end}`
  return new Date(`${p.start}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})
// Members who were in the group during this period (joined before it ended, left after it started or never).
const membersThen = computed(() =>
  members.value.filter((m) => {
    const joined = m.joinedAt?.toDate().toISOString().slice(0, 10) ?? '0000'
    const left = m.leftAt?.toDate().toISOString().slice(0, 10) ?? null
    return joined <= period.value.end && (left === null || left >= period.value.start)
  }),
)
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 pt-6 pb-8">
    <EmptyState v-if="hidden" title="This group isn’t available" body="An admin has archived it." />
    <GroupHeader v-else-if="group" :group="group" current="history" />
    <template v-if="group && !hidden">
      <div class="mt-6 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous period" @click="step(-1)"><PhCaretLeft :size="18" /></Button>
          <Button variant="outline" size="icon" aria-label="Next period" :disabled="isCurrent" @click="step(1)"><PhCaretRight :size="18" /></Button>
        </div>
        <CadenceTabs v-model="cadence" />
      </div>
      <h2 class="mt-3 text-xl">{{ label }}</h2>
      <PeriodGrid class="mt-3" :tasks="tasks" :members="membersThen" :completions="completions" :period="period" :closed="period.end < today" :name-of="nameOf" />
    </template>
  </section>
</template>
