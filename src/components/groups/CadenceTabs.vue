<script setup lang="ts">
import type { Cadence } from '@/types/task'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
const model = defineModel<Cadence>({ required: true })
const items: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
]
</script>

<template>
  <SegmentedControl v-model="model" :options="items" label="Cadence" />
</template>
