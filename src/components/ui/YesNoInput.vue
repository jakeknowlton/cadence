<script setup lang="ts">
/** Yes / No that can also be unanswered (null); tapping the selected answer clears it. */
defineProps<{ id?: string; label?: string }>()
const model = defineModel<boolean | null | undefined>({ required: true })
const OPTIONS = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
] as const
</script>

<template>
  <div :id="id" role="group" :aria-label="label" class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
    <button
      v-for="o in OPTIONS"
      :key="o.label"
      type="button"
      class="h-9 rounded-[7px] text-sm font-medium transition-colors"
      :class="model === o.value ? 'bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted-foreground hover:text-foreground'"
      :aria-pressed="model === o.value"
      @click="model = model === o.value ? null : o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
