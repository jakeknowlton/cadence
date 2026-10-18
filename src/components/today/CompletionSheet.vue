<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PhTrash } from '@phosphor-icons/vue'
import type { TaskVersionDoc } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'
import { entryMisses, formatValue, missingRequiredFields, periodTotals, roundToStep, totalProgress } from '@/lib/completionStatus'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DurationInput from '@/components/ui/DurationInput.vue'
import YesNoInput from '@/components/ui/YesNoInput.vue'
import SelectField from '@/components/ui/SelectField.vue'

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

function reset(from: Completion | null) {
  editing.value = from
  const v: CompletionValues = {}
  for (const f of props.version?.fields ?? []) {
    const existingVal = from?.values[f.key]
    v[f.key] = existingVal ?? (f.default as CompletionValues[string]) ?? null
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

const normalized = computed<CompletionValues>(() => {
  const out: CompletionValues = {}
  for (const f of props.version?.fields ?? []) {
    const v = values.value[f.key]
    if (f.type === 'number') out[f.key] = v === '' || v === null || v === undefined ? null : roundToStep(Number(v), f.step)
    else if (f.type === 'text') out[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null
    else out[f.key] = v ?? null
  }
  return out
})
// Required fields must be filled before saving; an entry that misses a per-entry limit is saved but doesn't qualify.
const errors = computed(() =>
  props.version ? missingRequiredFields(props.version.snapshot, normalized.value).map((k) => `${labelOf(k)} is required`) : [],
)
const misses = computed(() =>
  (props.version ? entryMisses(props.version.snapshot, normalized.value) : []).map((m) => {
    const f = fieldOf(m.key)
    const label = f?.label || m.key
    const limit = `${m.side === 'min' ? 'at least' : 'at most'} ${formatValue(m.limit, f?.type ?? 'number', f?.unit)}`
    return m.blank ? `${label} is empty; each entry needs ${limit}` : `${label} needs to be ${limit} per entry`
  }),
)
const PERIOD_WORD = { daily: 'today', weekly: 'this week', monthly: 'this month' } as const
/** Period totals including this entry (and without the one being edited), so the member sees progress before saving. */
const totalsAfter = computed(() => {
  if (!props.version) return []
  const others = props.existing.filter((c) => c.id !== editing.value?.id).map((c) => c.values)
  return periodTotals(props.version.snapshot, [...others, normalized.value]).map((t) => {
    const f = fieldOf(t.key)!
    return { key: t.key, ok: t.ok, text: `${f.label} ${PERIOD_WORD[props.version!.cadence]}: ${totalProgress(t, f)}` }
  })
})
const fieldOf = (key: string) => props.version?.fields.find((f) => f.key === key)
const labelOf = (key: string) => fieldOf(key)?.label ?? key

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
          <Label :for="`f-${f.key}`">{{ f.label }}<span v-if="f.unit" class="text-muted-foreground"> ({{ f.unit }})</span><span v-if="f.required"> *</span></Label>
          <YesNoInput
            v-if="f.type === 'boolean'"
            :id="`f-${f.key}`"
            :label="f.label"
            :model-value="(values[f.key] as boolean | null)"
            @update:model-value="values[f.key] = $event ?? null"
          />
          <template v-else>
            <Input
              v-if="f.type === 'number'"
              :id="`f-${f.key}`"
              :model-value="(values[f.key] as number | string | null) ?? undefined"
              type="number"
              inputmode="decimal"
              step="any"
              @update:model-value="values[f.key] = $event === '' ? null : $event"
            />
            <DurationInput
              v-else-if="f.type === 'duration'"
              :id="`f-${f.key}`"
              :model-value="(values[f.key] as number | null)"
              placeholder="mm:ss or h:mm:ss"
              @update:model-value="values[f.key] = $event ?? null"
            />
            <SelectField
              v-else-if="f.type === 'select'"
              :id="`f-${f.key}`"
              :model-value="(values[f.key] as string) ?? ''"
              :options="[{ value: '', label: '—' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]"
              @update:model-value="values[f.key] = $event || null"
            />
            <Input v-else :id="`f-${f.key}`" :model-value="(values[f.key] as string | null) ?? ''" @update:model-value="values[f.key] = String($event)" />
            <p v-if="f.type === 'number' && f.step" class="text-xs text-muted-foreground">
              Rounded to the nearest {{ f.step }}<template v-if="typeof normalized[f.key] === 'number' && normalized[f.key] !== Number(values[f.key])">: saves as {{ normalized[f.key] }}</template>
            </p>
          </template>
        </div>
        <div class="grid gap-1.5">
          <Label for="f-note">Note</Label>
          <Input id="f-note" v-model="note" placeholder="Optional" maxlength="200" />
        </div>
        <div v-if="misses.length" class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <p v-for="m in misses" :key="m">{{ m }}</p>
          <p class="font-semibold">This entry will be saved but won’t qualify.</p>
        </div>
        <p v-for="t in totalsAfter" :key="t.key" class="tabular text-sm" :class="t.ok ? 'font-semibold text-primary' : 'text-muted-foreground'">
          {{ t.text }}
        </p>
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
