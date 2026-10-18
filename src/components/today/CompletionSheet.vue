<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PhTrash } from '@phosphor-icons/vue'
import type { TaskField } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'
import { formatValue, missingRequiredFields, targetMet } from '@/lib/completionStatus'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import NativeSelect from '@/components/ui/NativeSelect.vue'

const props = defineProps<{
  version: TaskVersionDoc | null
  /** existing completions for this period */
  existing: Completion[]
  editable: boolean
  periodLabel: string
  saving?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  save: [values: CompletionValues, note: string | null, editing: Completion | null]
  remove: [completion: Completion]
}>()

const values = ref<CompletionValues>({})
const note = ref('')
const editing = ref<Completion | null>(null)
const durationText = ref<Record<string, string>>({})

function reset(from: Completion | null) {
  editing.value = from
  const v: CompletionValues = {}
  for (const f of props.version?.fields ?? []) {
    const existingVal = from?.values[f.key]
    v[f.key] = existingVal ?? (f.default as CompletionValues[string]) ?? (f.type === 'boolean' ? false : null)
    if (f.type === 'duration') durationText.value[f.key] = typeof v[f.key] === 'number' ? formatValue(v[f.key], 'duration') : ''
  }
  values.value = v
  note.value = from?.note ?? ''
}
watch(
  () => [open.value, props.version?.id],
  () => {
    if (open.value) reset(null)
  },
)

function parseDuration(text: string): number | null {
  const parts = text.trim().split(':').map(Number)
  if (parts.some((n) => Number.isNaN(n)) || parts.length === 0 || text.trim() === '') return null
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}
function onDuration(f: TaskField) {
  values.value[f.key] = parseDuration(durationText.value[f.key] ?? '')
}

const normalized = computed<CompletionValues>(() => {
  const out: CompletionValues = {}
  for (const f of props.version?.fields ?? []) {
    const v = values.value[f.key]
    if (f.type === 'number') out[f.key] = v === '' || v === null || v === undefined ? null : Number(v)
    else if (f.type === 'text') out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null
    else out[f.key] = v ?? null
  }
  return out
})
const errors = computed(() => {
  if (!props.version) return []
  const errs: string[] = []
  const missing = missingRequiredFields(props.version.snapshot, normalized.value)
  for (const k of missing) errs.push(`${labelOf(k)} is required`)
  for (const f of props.version.fields) {
    const v = normalized.value[f.key]
    if (typeof v !== 'number') continue
    if (f.min !== undefined && v < f.min) errs.push(`${f.label} must be at least ${f.min}`)
    if (f.max !== undefined && v > f.max) errs.push(`${f.label} must be at most ${f.max}`)
  }
  return errs
})
const goal = computed(() => (props.version ? targetMet(props.version.snapshot, normalized.value) : null))
const labelOf = (key: string) => props.version?.fields.find((f) => f.key === key)?.label ?? key

function submit() {
  if (errors.value.length) return
  emit('save', normalized.value, note.value.trim() || null, editing.value)
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="bottom" class="max-h-[90dvh] overflow-y-auto rounded-t-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
      <SheetHeader v-if="version" class="p-0 text-left">
        <SheetTitle>{{ version.name }}</SheetTitle>
        <SheetDescription>{{ periodLabel }}<template v-if="version.description"> · {{ version.description }}</template></SheetDescription>
      </SheetHeader>

      <ul v-if="existing.length" class="row-list mt-4 rounded-xl bg-muted/60 text-sm">
        <li v-for="c in existing" :key="c.id" class="flex items-center gap-2 px-3 py-2">
          <div class="min-w-0 flex-1">
            <span v-for="f in version?.fields ?? []" :key="f.key" class="mr-3">
              <template v-if="formatValue(c.values[f.key], f.type, f.unit)">{{ f.label }}: {{ formatValue(c.values[f.key], f.type, f.unit) }}</template>
            </span>
            <span v-if="!version?.fields.length" class="text-muted-foreground">Done</span>
            <div v-if="c.note" class="truncate text-xs text-muted-foreground">{{ c.note }}</div>
          </div>
          <template v-if="editable">
            <Button v-if="version?.fields.length" size="sm" variant="ghost" @click="reset(c)">Edit</Button>
            <Button size="sm" variant="ghost" aria-label="Delete" @click="emit('remove', c)"><PhTrash :size="16" /></Button>
          </template>
        </li>
      </ul>

      <form v-if="version && editable" class="mt-4 grid gap-4" @submit.prevent="submit">
        <div v-for="f in version.fields" :key="f.key" class="grid gap-1.5">
          <div v-if="f.type === 'boolean'" class="flex items-center justify-between">
            <Label :for="`f-${f.key}`">{{ f.label }}</Label>
            <Switch :id="`f-${f.key}`" :model-value="!!values[f.key]" @update:model-value="values[f.key] = $event" />
          </div>
          <template v-else>
            <Label :for="`f-${f.key}`">{{ f.label }}<span v-if="f.unit" class="text-muted-foreground"> ({{ f.unit }})</span><span v-if="f.required"> *</span></Label>
            <Input
              v-if="f.type === 'number'"
              :id="`f-${f.key}`"
              :model-value="(values[f.key] as number | string | null) ?? undefined"
              type="number"
              inputmode="decimal"
              :min="f.min"
              :max="f.max"
              :step="f.step ?? 'any'"
              @update:model-value="values[f.key] = $event === '' ? null : $event"
            />
            <Input
              v-else-if="f.type === 'duration'"
              :id="`f-${f.key}`"
              v-model="durationText[f.key]"
              inputmode="numeric"
              placeholder="mm:ss or h:mm:ss"
              @input="onDuration(f)"
            />
            <NativeSelect
              v-else-if="f.type === 'select'"
              :id="`f-${f.key}`"
              :model-value="(values[f.key] as string) ?? ''"
              :options="[{ value: '', label: '—' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]"
              @update:model-value="values[f.key] = $event || null"
            />
            <Input v-else :id="`f-${f.key}`" :model-value="(values[f.key] as string | null) ?? ''" @update:model-value="values[f.key] = String($event)" />
          </template>
        </div>
        <div class="grid gap-1.5">
          <Label for="f-note">Note</Label>
          <Input id="f-note" v-model="note" placeholder="Optional" maxlength="200" />
        </div>
        <p v-if="goal === false" class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Goal not met: this won’t count</p>
        <ul v-if="errors.length" class="list-disc pl-4 text-sm text-destructive">
          <li v-for="e in errors" :key="e">{{ e }}</li>
        </ul>
        <Button type="submit" size="lg" class="mt-1 w-full" :disabled="saving || errors.length > 0">
          {{ editing ? 'Save changes' : existing.length ? 'Log another' : 'Log it' }}
        </Button>
        <Button v-if="editing" type="button" variant="ghost" @click="reset(null)">Cancel edit</Button>
      </form>
      <p v-else-if="version && !editable" class="mt-4 text-sm text-muted-foreground">This period can no longer be edited.</p>
    </SheetContent>
  </Sheet>
</template>
