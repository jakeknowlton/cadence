<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Membership, TaskVersionDoc } from '@/types/group'
import type { Completion } from '@/types/completion'
import { formatValue, periodStatus } from '@/lib/completionStatus'
import { iconFor } from '@/lib/icons'
import type { Period } from '@/lib/periods'
import StatusMark from './StatusMark.vue'

const props = defineProps<{
  tasks: TaskVersionDoc[]
  members: Membership[]
  completions: Completion[]
  period: Period
  /** the period has ended, so an empty cell is a miss rather than pending */
  closed?: boolean
  nameOf: (uid: string) => string
}>()

const selected = ref(0)
watch(() => props.tasks.map((t) => t.id).join(), () => (selected.value = Math.min(selected.value, Math.max(0, props.tasks.length - 1))))

function cell(task: TaskVersionDoc, uid: string) {
  const cs = props.completions.filter((c) => c.taskId === task.taskId && c.userId === uid && c.periodKey === props.period.key && !c.deletedAt)
  const status = periodStatus(task.snapshot, cs)
  // Every entry is a data point, so show the period's total of the first number or duration field.
  const field = task.fields.find((f) => f.type === 'number' || f.type === 'duration')
  const sums = field ? cs.map((c) => c.values[field.key]).filter((v): v is number => typeof v === 'number') : []
  const value = field && sums.length ? formatValue(sums.reduce((a, b) => a + b, 0), field.type, field.unit) : ''
  return { status, value }
}
const selectedTask = computed(() => props.tasks[selected.value] ?? null)
</script>

<template>
  <p v-if="tasks.length === 0" class="text-sm text-muted-foreground">No tasks for this period.</p>
  <div v-else>
    <!-- Phone: one task at a time -->
    <div class="md:hidden">
      <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        <button
          v-for="(t, i) in tasks"
          :key="t.id"
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
          :class="i === selected ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'"
          :aria-pressed="i === selected"
          @click="selected = i"
        >
          <component :is="iconFor(t.icon)" :size="16" /> {{ t.name }}
        </button>
      </div>
      <ul v-if="selectedTask" class="panel row-list overflow-hidden">
        <li v-for="m in members" :key="m.id" class="flex items-center gap-3 px-4 py-3">
          <span class="min-w-0 flex-1 truncate font-medium">{{ nameOf(m.userId) }}</span>
          <span class="tabular text-sm text-muted-foreground">{{ cell(selectedTask, m.userId).value }}</span>
          <StatusMark :status="cell(selectedTask, m.userId).status" :closed="closed" />
        </li>
      </ul>
    </div>

    <!-- Wide: full matrix -->
    <div class="panel hidden overflow-x-auto p-2 md:block">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted-foreground">
            <th class="px-3 py-2 font-medium">Member</th>
            <th v-for="t in tasks" :key="t.id" class="px-2 py-2 text-center font-medium">
              <span class="inline-flex items-center gap-1.5"><component :is="iconFor(t.icon)" :size="16" /> {{ t.name }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in members" :key="m.id" class="border-t border-border/60">
            <td class="px-3 py-2.5 font-medium">{{ nameOf(m.userId) }}</td>
            <td v-for="t in tasks" :key="t.id" class="px-2 py-2.5 text-center">
              <div class="inline-flex flex-col items-center gap-1">
                <StatusMark :status="cell(t, m.userId).status" :closed="closed" />
                <span class="tabular text-xs text-muted-foreground">{{ cell(t, m.userId).value }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
