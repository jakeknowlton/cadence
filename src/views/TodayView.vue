<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { PhCaretLeft, PhCaretRight, PhUsersThree } from '@phosphor-icons/vue'
import { useGroupsStore } from '@/stores/groups'
import { useToday } from '@/composables/useToday'
import { shiftDays } from '@/lib/periods'
import TodayGroupSection from '@/components/today/TodayGroupSection.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { Button } from '@/components/ui/button'

const groupsStore = useGroupsStore()
const { today } = useToday()

const offset = ref(0)
const date = computed(() => shiftDays(today.value, -offset.value))
const title = computed(() => (offset.value === 0 ? 'Today' : offset.value === 1 ? 'Yesterday' : weekday(date.value)))
const subtitle = computed(() => new Date(`${date.value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))
function weekday(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })
}
const MAX_BACK = 7

// Beat strip: one dot per task across every group, in group order.
const beatsByGroup = reactive(new Map<string, { id: string; done: boolean }[]>())
function onSummary(groupId: string, beats: { id: string; done: boolean }[]) {
  beatsByGroup.set(groupId, beats)
}
const beats = computed(() => groupsStore.myGroups.flatMap((g) => beatsByGroup.get(g.id) ?? []))
const done = computed(() => beats.value.filter((b) => b.done).length)
const allDone = computed(() => beats.value.length > 0 && done.value === beats.value.length)
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <PageHeader :title="title" :subtitle="subtitle" brand>
      <Button variant="outline" size="icon" aria-label="Previous day" :disabled="offset >= MAX_BACK" @click="offset++"><PhCaretLeft :size="18" /></Button>
      <Button variant="outline" size="icon" aria-label="Next day" :disabled="offset === 0" @click="offset--"><PhCaretRight :size="18" /></Button>
    </PageHeader>

    <div v-if="beats.length" class="mt-5 flex items-center gap-4" aria-live="polite">
      <div class="flex flex-wrap gap-1.5" role="img" :aria-label="`${done} of ${beats.length} tasks done`">
        <span
          v-for="b in beats"
          :key="b.id"
          class="size-3 rounded-full transition-colors duration-300"
          :class="b.done ? 'bg-primary' : 'ring-2 ring-border ring-inset'"
        />
      </div>
      <span class="tabular text-sm text-muted-foreground">
        <template v-if="allDone">All done. Nice rhythm.</template>
        <template v-else>{{ done }} of {{ beats.length }} done</template>
      </span>
    </div>

    <div class="mt-5 grid gap-4">
      <TodayGroupSection v-for="g in groupsStore.myGroups" :key="g.id" :group-id="g.id" :date="date" @summary="onSummary" />
      <EmptyState
        v-if="!groupsStore.myGroupsPending && groupsStore.myGroups.length === 0"
        :icon="PhUsersThree"
        title="No groups yet"
        body="An admin adds you to a group, and its tasks show up here each day."
      />
    </div>
  </section>
</template>
