<script setup lang="ts">
import { PhCheck, PhTarget } from '@phosphor-icons/vue'
import type { PeriodStatus } from '@/lib/completionStatus'
defineProps<{ status: PeriodStatus; closed?: boolean }>()
</script>

<template>
  <span
    v-if="status.complete"
    class="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
    :class="status.goalMet ? 'ring-2 ring-goal ring-offset-2 ring-offset-surface' : ''"
    :title="status.goalMet ? 'Done, goal met' : 'Done'"
  >
    <PhTarget v-if="status.goalMet" :size="15" weight="fill" />
    <PhCheck v-else :size="15" weight="bold" />
  </span>
  <span v-else-if="status.required > 1" class="tabular inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
    {{ status.count }}/{{ status.required }}
  </span>
  <span v-else-if="status.total > 0" class="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground" title="Logged, goal not met">
    <PhTarget :size="15" />
  </span>
  <span v-else-if="closed" class="inline-flex size-8 items-center justify-center rounded-full bg-missed/10 text-missed" title="Missed">
    <span class="h-0.5 w-3 rounded-full bg-current" />
  </span>
  <span v-else class="inline-flex size-8 items-center justify-center rounded-full border-2 border-dashed border-border" title="Not yet" />
</template>
