<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import type { Cadence, FieldType, TaskDefinition, TaskField, Weekday } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import { classifyEdit, validateDefinition, type EditClassification } from '@/lib/taskEdits'
import { effectiveFromForChange } from '@/lib/versions'
import type { DateString } from '@/lib/periods'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import NativeSelect from '@/components/ui/NativeSelect.vue'
import IconPicker from './IconPicker.vue'

const props = defineProps<{
  /** The current version when editing; null when creating. */
  current: TaskVersionDoc | null
  /** Lineage field signatures (type|unit) for the refused-edit check. */
  lineage: Record<string, string>
  today: DateString
  weekStartsOn: Weekday
  initial: TaskDefinition
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [def: TaskDefinition, classification: EditClassification, effectiveFrom: DateString]
  replace: [def: TaskDefinition, effectiveFrom: DateString]
  cancel: []
}>()

const def = reactive<TaskDefinition>(structuredClone(props.initial))
watch(
  () => props.current?.id ?? null,
  () => Object.assign(def, structuredClone(props.initial)),
)

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'duration', label: 'Duration' },
  { value: 'text', label: 'Text' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'select', label: 'Choice' },
]
const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 0, label: 'Su' }, { value: 1, label: 'Mo' }, { value: 2, label: 'Tu' }, { value: 3, label: 'We' },
  { value: 4, label: 'Th' }, { value: 5, label: 'Fr' }, { value: 6, label: 'Sa' },
]
const COMPARATORS = [
  { value: '>=', label: 'at least' },
  { value: '<=', label: 'at most' },
  { value: '==', label: 'exactly' },
  { value: 'between', label: 'between' },
] as const

const allDays = computed({
  get: () => def.activeDays === null,
  set: (v) => (def.activeDays = v ? null : [1, 2, 3, 4, 5]),
})
function toggleDay(d: Weekday) {
  if (def.activeDays === null) return
  def.activeDays = def.activeDays.includes(d) ? def.activeDays.filter((x) => x !== d) : [...def.activeDays, d].sort()
}

const hasTarget = computed({
  get: () => !!def.target,
  set: (v) => {
    def.target = v ? { fieldKey: numericFields.value[0]?.key ?? '', comparator: '>=', value: 1, gatesCompletion: false } : undefined
  },
})
const numericFields = computed(() => def.fields.filter((f) => f.type === 'number' || f.type === 'duration'))
const optionsText = reactive<Record<string, string>>({})

function keyFor(label: string, existing: string[]): string {
  const base = label
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
  const key = /^[a-z]/.test(base) ? base : `f${base}`
  let k = key || 'field'
  let n = 2
  while (existing.includes(k)) k = `${key}${n++}`
  return k
}
const lockedKeys = computed(() => new Set(Object.keys(props.lineage)))
function addField() {
  const f: TaskField = { key: keyFor('field', def.fields.map((x) => x.key)), label: '', type: 'number', required: false }
  def.fields.push(f)
  if (def.completionType === 'checkbox') def.completionType = 'fields'
}
function removeField(i: number) {
  const f = def.fields[i]!
  def.fields.splice(i, 1)
  if (def.target?.fieldKey === f.key) def.target = undefined
}
function onLabelInput(f: TaskField) {
  // New fields take their key from the label until first saved; existing keys never change.
  if (!lockedKeys.value.has(f.key) && !props.current?.fieldKeys.includes(f.key)) {
    f.key = keyFor(f.label || 'field', def.fields.filter((x) => x !== f).map((x) => x.key))
  }
}
function syncOptions(f: TaskField) {
  f.options = (optionsText[f.key] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
watch(
  () => def.fields.map((f) => f.key + f.type),
  () => {
    for (const f of def.fields) {
      if (f.type === 'select' && optionsText[f.key] === undefined) optionsText[f.key] = (f.options ?? []).join(', ')
    }
  },
  { immediate: true },
)
watch(
  () => def.completionType,
  (t) => {
    if (t === 'checkbox') {
      def.fields = []
      def.target = undefined
    }
  },
)

const errors = computed(() => validateDefinition(normalized.value))
const normalized = computed<TaskDefinition>(() => ({
  ...def,
  name: def.name.trim(),
  description: def.description?.trim() || undefined,
  activeDays: def.cadence === 'daily' ? def.activeDays : null,
  fields: def.fields.map((f) => ({
    ...f,
    label: f.label.trim() || f.key,
    unit: f.unit?.trim() || undefined,
    min: numOrUndef(f.min),
    max: numOrUndef(f.max),
    step: numOrUndef(f.step),
    options: f.type === 'select' ? f.options : undefined,
    default: f.default === '' || f.default === undefined || f.default === null ? undefined : f.default,
  })),
}))
function numOrUndef(v: unknown): number | undefined {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const classification = computed<EditClassification>(() =>
  props.current
    ? classifyEdit(definitionOfCurrent.value, normalized.value, props.lineage)
    : { class: 'measured', reasons: ['new task'] },
)
const definitionOfCurrent = computed<TaskDefinition>(() => {
  const c = props.current!
  return { name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder, cadence: c.cadence,
    activeDays: c.activeDays, requiredCount: c.requiredCount, completionType: c.completionType, fields: c.fields, target: c.target ?? undefined }
})
const effectiveFrom = computed(() =>
  props.current
    ? effectiveFromForChange(props.today, props.current.cadence, normalized.value.cadence, props.weekStartsOn)
    : props.today,
)
const effectSummary = computed(() => {
  if (!props.current) return `New task, starts today (${props.today}).`
  switch (classification.value.class) {
    case 'none':
      return 'No changes.'
    case 'cosmetic':
      return 'Applies immediately. History shows the new name.'
    case 'measured':
      return `Creates a new version from ${effectiveFrom.value}. Earlier periods keep the current definition.`
    case 'refused':
      return 'A field’s type or unit cannot change. Replace the task instead: the current one is retired and a new one starts.'
    default:
      return ''
  }
})
const canSave = computed(
  () => errors.value.length === 0 && classification.value.class !== 'none' && classification.value.class !== 'refused' && !props.saving,
)
const canReplace = computed(() => !!props.current && errors.value.length === 0 && !props.saving)
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="canSave && emit('save', normalized, classification, effectiveFrom)">
    <div class="panel grid gap-5 p-4">
    <div class="grid gap-1.5">
      <Label for="task-name">Name</Label>
      <Input id="task-name" v-model="def.name" placeholder="Run a mile" maxlength="60" />
    </div>
    <div class="grid gap-1.5">
      <Label for="task-desc">Description</Label>
      <Input id="task-desc" v-model="def.description" placeholder="Optional" maxlength="200" />
    </div>
    <div class="grid gap-1.5">
      <Label>Icon</Label>
      <IconPicker v-model="def.icon" />
    </div>
    </div>

    <div class="panel grid gap-5 p-4">
    <div class="grid grid-cols-2 gap-3">
      <div class="grid gap-1.5">
        <Label for="task-cadence">Cadence</Label>
        <NativeSelect id="task-cadence" v-model="def.cadence" :options="CADENCES" />
      </div>
      <div class="grid gap-1.5">
        <Label for="task-required">Times per period</Label>
        <Input id="task-required" v-model.number="def.requiredCount" type="number" inputmode="numeric" min="1" step="1" />
      </div>
    </div>

    <div v-if="def.cadence === 'daily'" class="grid gap-2">
      <div class="flex items-center justify-between">
        <Label for="task-alldays">Every day</Label>
        <Switch id="task-alldays" :model-value="allDays" @update:model-value="allDays = $event" />
      </div>
      <div v-if="def.activeDays !== null" class="flex gap-1">
        <button
          v-for="d in WEEKDAYS"
          :key="d.value"
          type="button"
          class="h-10 flex-1 rounded-lg text-sm font-medium transition-colors"
          :class="def.activeDays.includes(d.value) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          :aria-pressed="def.activeDays.includes(d.value)"
          @click="toggleDay(d.value)"
        >
          {{ d.label }}
        </button>
      </div>
    </div>

    </div>

    <div class="panel grid gap-4 p-4">
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label for="task-fields" class="text-base font-semibold">Log details</Label>
        <p class="mt-1 text-sm text-muted-foreground">Off: a simple check-off. On: members enter values.</p>
      </div>
      <Switch
        id="task-fields"
        :model-value="def.completionType === 'fields'"
        @update:model-value="def.completionType = $event ? 'fields' : 'checkbox'"
      />
    </div>

    <div v-if="def.completionType === 'fields'" class="grid gap-3">
      <div v-for="(f, i) in def.fields" :key="i" class="grid gap-3 rounded-xl bg-muted/60 p-3">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <Input v-model="f.label" placeholder="Label (e.g. Distance)" @input="onLabelInput(f)" />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove field" @click="removeField(i)">
            <PhTrash :size="18" />
          </Button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <NativeSelect v-model="f.type" :options="FIELD_TYPES" :disabled="lockedKeys.has(f.key)" />
          <Input
            v-if="f.type === 'number'"
            v-model="f.unit"
            placeholder="Unit (mi, kcal)"
            :disabled="lockedKeys.has(f.key)"
          />
        </div>
        <div v-if="f.type === 'number'" class="grid grid-cols-3 gap-2">
          <Input v-model="f.min" type="number" inputmode="decimal" placeholder="Min" />
          <Input v-model="f.max" type="number" inputmode="decimal" placeholder="Max" />
          <Input v-model="f.step" type="number" inputmode="decimal" placeholder="Step" />
        </div>
        <Input
          v-if="f.type === 'select'"
          v-model="optionsText[f.key]"
          placeholder="Choices, comma separated"
          @input="syncOptions(f)"
        />
        <div class="flex items-center justify-between">
          <Label :for="`req-${i}`">Required</Label>
          <Switch :id="`req-${i}`" :model-value="f.required" @update:model-value="f.required = $event" />
        </div>
        <p v-if="lockedKeys.has(f.key)" class="text-sm text-muted-foreground">
          Type and unit are locked so past entries stay comparable.
        </p>
      </div>
      <Button type="button" variant="outline" @click="addField">
        <PhPlus :size="16" weight="bold" />
        Add field
      </Button>

      <div v-if="numericFields.length" class="grid gap-3 rounded-xl bg-muted/60 p-3">
        <div class="flex items-center justify-between">
          <Label for="task-target" class="font-semibold">Goal</Label>
          <Switch id="task-target" :model-value="hasTarget" @update:model-value="hasTarget = $event" />
        </div>
        <template v-if="def.target">
          <div class="grid grid-cols-2 gap-2">
            <NativeSelect v-model="def.target.fieldKey" :options="numericFields.map((f) => ({ value: f.key, label: f.label || f.key }))" />
            <NativeSelect v-model="def.target.comparator" :options="[...COMPARATORS]" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Input v-model.number="def.target.value" type="number" inputmode="decimal" placeholder="Value" />
            <Input
              v-if="def.target.comparator === 'between'"
              v-model.number="def.target.valueMax"
              type="number"
              inputmode="decimal"
              placeholder="and"
            />
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <Label for="task-gates">Goal required to count</Label>
              <p class="text-sm text-muted-foreground">Off: the goal is a badge. On: a period is only done if the goal is met.</p>
            </div>
            <Switch id="task-gates" :model-value="def.target.gatesCompletion" @update:model-value="def.target!.gatesCompletion = $event" />
          </div>
        </template>
      </div>
    </div>
    </div>

    <Alert v-if="errors.length" variant="destructive">
      <AlertDescription>
        <ul class="list-disc pl-4">
          <li v-for="e in errors" :key="e">{{ e }}</li>
        </ul>
      </AlertDescription>
    </Alert>
    <Alert v-else>
      <AlertDescription>
        <p>{{ effectSummary }}</p>
        <ul v-if="current && classification.reasons.length" class="mt-1 list-disc pl-4 text-xs text-muted-foreground">
          <li v-for="r in classification.reasons" :key="r">{{ r }}</li>
        </ul>
      </AlertDescription>
    </Alert>

    <div class="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 bg-background/90 px-4 py-3 backdrop-blur-md md:bottom-0">
      <Button type="button" size="lg" variant="outline" class="flex-1" :disabled="saving" @click="emit('cancel')">Cancel</Button>
      <Button
        v-if="classification.class === 'refused'"
        type="button"
        size="lg"
        class="flex-1"
        :disabled="!canReplace"
        @click="emit('replace', normalized, effectiveFrom)"
      >
        Replace task
      </Button>
      <Button v-else type="submit" size="lg" class="flex-1" :disabled="!canSave">{{ current ? 'Save changes' : 'Create task' }}</Button>
    </div>
  </form>
</template>
