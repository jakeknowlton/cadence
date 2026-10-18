<script setup lang="ts">
import { ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ id?: string; ariaLabel?: string }>()
/** Seconds, or null when every box is empty. */
const model = defineModel<number | null | undefined>({ required: true })

const UNITS = [
  { key: 'h', name: 'hours', suffix: 'h' },
  { key: 'm', name: 'minutes', suffix: 'm' },
  { key: 's', name: 'seconds', suffix: 's' },
] as const
type Unit = (typeof UNITS)[number]['key']

const boxes = ref<Record<Unit, string>>({ h: '', m: '', s: '' })
const inputs = ref<HTMLInputElement[]>([])

function split(total: number | null | undefined): Record<Unit, string> {
  if (typeof total !== 'number') return { h: '', m: '', s: '' }
  return { h: String(Math.floor(total / 3600)), m: String(Math.floor((total % 3600) / 60)), s: String(Math.round(total % 60)) }
}
function seconds(b: Record<Unit, string>): number | null {
  if (!b.h && !b.m && !b.s) return null
  return Number(b.h || 0) * 3600 + Number(b.m || 0) * 60 + Number(b.s || 0)
}

boxes.value = split(model.value)
// Follow outside changes (such as a reset) without rewriting what the user is typing.
watch(model, (v) => {
  if (v !== seconds(boxes.value)) boxes.value = split(v)
})

function onInput(i: number, unit: Unit, e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/\D/g, '').slice(0, 2)
  el.value = digits
  boxes.value[unit] = digits
  model.value = seconds(boxes.value)
  // Two digits fills a box; move on so "1830" types straight through minutes and seconds.
  if (digits.length === 2 && i < UNITS.length - 1) inputs.value[i + 1]?.focus()
}
function onKeydown(i: number, unit: Unit, e: KeyboardEvent) {
  if (e.key === 'Backspace' && !boxes.value[unit] && i > 0) {
    e.preventDefault()
    inputs.value[i - 1]?.focus()
  }
}
/** 75 minutes reads better as 1 h 15 m once the member leaves the field (not when moving between its boxes). */
function normalise(e: FocusEvent) {
  if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) return
  const total = seconds(boxes.value)
  if (total !== null) boxes.value = split(total)
}
</script>

<template>
  <div role="group" :aria-label="props.ariaLabel" class="flex items-center gap-1.5" @focusout="normalise">
    <template v-for="(u, i) in UNITS" :key="u.key">
      <input
        :id="i === 0 ? id : undefined"
        ref="inputs"
        :value="boxes[u.key]"
        :aria-label="`${props.ariaLabel ?? 'Duration'} ${u.name}`"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        placeholder="–"
        class="h-10 w-12 min-w-0 rounded-lg border border-input bg-surface px-2 text-center text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
        @input="onInput(i, u.key, $event)"
        @keydown="onKeydown(i, u.key, $event)"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <span class="text-sm text-muted-foreground" aria-hidden="true">{{ u.suffix }}</span>
    </template>
  </div>
</template>
