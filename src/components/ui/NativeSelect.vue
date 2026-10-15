<script setup lang="ts" generic="T extends string | number">
import { PhCaretDown } from '@phosphor-icons/vue'
defineProps<{ options: { value: T; label: string }[]; id?: string; disabled?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <span class="relative block">
    <select
      :id="id"
      v-model="model"
      :disabled="disabled"
      class="h-10 w-full appearance-none rounded-lg border border-input bg-surface pr-9 pl-3 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50"
    >
      <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
    </select>
    <PhCaretDown :size="16" class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
  </span>
</template>
