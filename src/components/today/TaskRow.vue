<script setup lang="ts">
import { computed } from 'vue'
import { PhCheck, PhPlus, PhTarget } from '@phosphor-icons/vue'
import type { TaskVersionDoc } from '@/types/group'
import type { PeriodStatus } from '@/lib/completionStatus'
import { iconFor } from '@/lib/icons'

const props = defineProps<{ version: TaskVersionDoc; status: PeriodStatus; editable: boolean; busy?: boolean }>()
const emit = defineEmits<{ toggle: []; open: [] }>()

const multi = computed(() => props.version.requiredCount > 1)
const hasFields = computed(() => props.version.completionType === 'fields')
const meta = computed(() => {
  const parts: string[] = []
  if (props.version.cadence !== 'daily') parts.push(props.version.cadence === 'weekly' ? 'this week' : 'this month')
  if (multi.value) parts.push(`${props.status.count} of ${props.status.required}`)
  if (props.status.total > 0 && !props.status.complete && props.status.count < props.status.total) parts.push('logged, goal not met')
  return parts.join(', ')
})
</script>

<template>
  <li class="flex items-center gap-1 pr-2 pl-1">
    <button type="button" class="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-accent/60 active:bg-accent" @click="emit('open')">
      <component :is="iconFor(version.icon)" :size="24" class="shrink-0" :class="status.complete ? 'text-primary' : 'text-muted-foreground'" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-[1.02rem] font-semibold" :class="status.complete ? 'text-muted-foreground' : ''">{{ version.name }}</div>
        <div class="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
          <span v-if="meta">{{ meta }}</span>
          <span v-if="status.goalMet === true" class="inline-flex items-center gap-1 rounded-full bg-goal/15 px-1.5 py-px text-[0.72rem] font-semibold text-goal">
            <PhTarget :size="11" weight="fill" /> goal met
          </span>
        </div>
      </div>
    </button>
    <button
      type="button"
      class="flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 disabled:opacity-40"
      :class="status.complete ? 'scale-100 border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground hover:border-primary/60 hover:text-primary'"
      :disabled="!editable || busy"
      :aria-label="status.complete ? 'Mark not done' : hasFields ? 'Log' : 'Mark done'"
      :aria-pressed="status.complete"
      @click="emit('toggle')"
    >
      <PhCheck v-if="status.complete || !multi" :size="22" weight="bold" />
      <PhPlus v-else :size="20" weight="bold" />
    </button>
  </li>
</template>
