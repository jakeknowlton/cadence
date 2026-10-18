<script setup lang="ts">
import { computed } from 'vue'
import { collectionGroup, limit, orderBy, query, where } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { PhArrowLeft } from '@phosphor-icons/vue'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'
import type { Completion } from '@/types/completion'
import { formatValue } from '@/lib/completionStatus'
import { parsePeriodKey } from '@/lib/periods'

const authStore = useAuthStore()
const groupsStore = useGroupsStore()

const raw = useCollection<Completion>(
  computed(() =>
    authStore.uid
      ? query(collectionGroup(db, 'completions'), where('userId', '==', authStore.uid), orderBy('periodKey', 'desc'), limit(300))
      : null,
  ),
)
const completions = computed(() => raw.value.filter((c) => !c.deletedAt && !groupsStore.isHidden(c.groupId, c.taskId)))
const groupName = (id: string) => groupsStore.myGroups.find((g) => g.id === id)?.name ?? 'a former group'

function summary(c: Completion) {
  return c.taskSnapshot.fields
    .map((f) => {
      const v = formatValue(c.values[f.key], f.type, f.unit)
      return v ? `${f.label} ${v}` : ''
    })
    .filter(Boolean)
    .join(' · ')
}
function monthLabel(m: string) {
  return new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
const byMonth = computed(() => {
  const groups = new Map<string, Completion[]>()
  for (const c of completions.value) {
    const m = parsePeriodKey(c.periodKey).start.slice(0, 7)
    groups.set(m, [...(groups.get(m) ?? []), c])
  }
  return [...groups.entries()]
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 pt-6 pb-8">
    <RouterLink :to="{ name: 'me' }" class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><PhArrowLeft :size="16" /> Me</RouterLink>
    <h1 class="mt-3 text-[1.75rem] leading-tight">My history</h1>
    <p v-if="completions.length === 0" class="mt-5 text-sm text-muted-foreground">Nothing logged yet.</p>
    <div v-for="[month, list] in byMonth" :key="month" class="mt-6">
      <h2 class="text-base text-muted-foreground">{{ monthLabel(month) }}</h2>
      <ul class="panel row-list mt-2 overflow-hidden text-sm">
        <li v-for="c in list" :key="c.id" class="flex items-center gap-3 px-4 py-2.5">
          <span class="tabular w-12 shrink-0 text-xs text-muted-foreground">{{ parsePeriodKey(c.periodKey).start.slice(5).replace('-', '/') }}</span>
          <span class="min-w-0 flex-1 truncate"><span class="font-medium">{{ c.taskName }}</span> <span class="text-muted-foreground">in {{ groupName(c.groupId) }}</span></span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ summary(c) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
