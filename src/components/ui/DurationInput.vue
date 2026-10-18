<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatValue, parseDuration } from '@/lib/completionStatus'
import { Input } from '@/components/ui/input'

defineProps<{ id?: string; placeholder?: string }>()
/** Seconds, or null when blank or not yet a valid duration. */
const model = defineModel<number | null | undefined>({ required: true })

const text = ref(typeof model.value === 'number' ? formatValue(model.value, 'duration') : '')
// Follow outside changes (such as a reset) without rewriting what the user is mid-way through typing.
watch(model, (v) => {
  if (v !== parseDuration(text.value)) text.value = typeof v === 'number' ? formatValue(v, 'duration') : ''
})
function onInput(v: string | number) {
  text.value = String(v)
  model.value = parseDuration(text.value)
}
</script>

<template>
  <Input :id="id" :model-value="text" inputmode="numeric" :placeholder="placeholder ?? 'mm:ss'" autocomplete="off" @update:model-value="onInput" />
</template>
