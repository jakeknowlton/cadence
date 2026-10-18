<script setup lang="ts" generic="T extends string | number">
import { computed } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const props = defineProps<{
  options: { value: T; label: string }[]
  id?: string
  disabled?: boolean
  /** Shown when the value matches no option, e.g. "Add a member…". */
  placeholder?: string
  /** Accessible name when there is no visible <Label for>. */
  label?: string
}>()
const model = defineModel<T>({ required: true })

// Reka reserves '' for "no selection", so an option whose value is '' (such as "—" to clear) gets a stand-in.
const NONE = '__none__'
const toItem = (v: T) => (v === '' ? NONE : v)
const selected = computed({
  get: () => (props.options.some((o) => o.value === model.value) ? toItem(model.value) : undefined),
  set: (v) => (model.value = (v === NONE ? '' : v) as T),
})
</script>

<template>
  <Select v-model="selected" :disabled="disabled">
    <SelectTrigger :id="id" :aria-label="label" class="h-10 w-full bg-surface pr-3 pl-3 text-foreground">
      <SelectValue :placeholder="placeholder" class="truncate" />
    </SelectTrigger>
    <SelectContent position="popper" class="max-h-72">
      <SelectItem v-for="o in options" :key="String(o.value)" :value="toItem(o.value)" class="py-2">{{ o.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
