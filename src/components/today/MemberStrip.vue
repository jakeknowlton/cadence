<script setup lang="ts">
import { computed } from 'vue'
import type { DayProgress } from '@/lib/completionStatus'

const props = defineProps<{ people: { uid: string; name: string; progress: DayProgress }[] }>()

const done = computed(() => props.people.filter((p) => p.progress === 'done').length)
const LABEL: Record<DayProgress, string> = { done: 'done', partial: 'in progress', none: 'not started' }
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : (parts[0]?.[1] ?? ''))).toUpperCase() || '?'
}
</script>

<template>
  <div class="flex items-center gap-3 px-4 pb-2.5">
    <ul class="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Who's done today">
      <li
        v-for="p in people"
        :key="p.uid"
        class="flex size-8 items-center justify-center rounded-full text-[0.7rem] font-bold"
        :class="{
          'bg-primary text-primary-foreground': p.progress === 'done',
          'bg-muted text-foreground ring-2 ring-primary/50 ring-inset': p.progress === 'partial',
          'bg-muted text-muted-foreground': p.progress === 'none',
        }"
        :title="`${p.name}: ${LABEL[p.progress]}`"
        :aria-label="`${p.name}: ${LABEL[p.progress]}`"
      >
        {{ initials(p.name) }}
      </li>
    </ul>
    <span class="tabular shrink-0 text-sm text-muted-foreground">{{ done }} of {{ people.length }} done</span>
  </div>
</template>
