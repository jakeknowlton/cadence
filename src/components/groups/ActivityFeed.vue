<script setup lang="ts">
import type { Completion } from '@/types/completion'
import { formatValue } from '@/lib/completionStatus'
import { iconFor } from '@/lib/icons'
import type { TaskVersionDoc } from '@/types/group'

const props = defineProps<{ completions: Completion[]; nameOf: (uid: string) => string; versions: TaskVersionDoc[] }>()

function summary(c: Completion) {
  return c.taskSnapshot.fields
    .map((f) => {
      const v = formatValue(c.values[f.key], f.type, f.unit)
      return v ? `${f.label.toLowerCase()} ${v}` : ''
    })
    .filter(Boolean)
    .join(', ')
}
const iconOf = (c: Completion) => props.versions.find((v) => v.id === c.taskVersionId)?.icon
function when(c: Completion) {
  const d = c.loggedAt?.toDate()
  if (!d) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <p v-if="completions.length === 0" class="text-sm text-muted-foreground">Nothing logged yet. The first check-off shows up here.</p>
  <ul v-else class="panel row-list overflow-hidden">
    <li v-for="c in completions" :key="c.id" class="flex items-start gap-3 px-4 py-3">
      <component :is="iconFor(iconOf(c))" :size="20" class="mt-0.5 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <div class="text-[0.95rem]"><span class="font-semibold">{{ nameOf(c.userId) }}</span> did {{ c.taskName }}</div>
        <div v-if="summary(c) || c.note" class="truncate text-sm text-muted-foreground">
          {{ summary(c) }}<template v-if="summary(c) && c.note">, </template><template v-if="c.note">“{{ c.note }}”</template>
        </div>
      </div>
      <span class="tabular shrink-0 pt-0.5 text-xs text-muted-foreground">{{ when(c) }}</span>
    </li>
  </ul>
</template>
