<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { PhPlus, PhTrash } from '@phosphor-icons/vue'
import type { Cadence, FieldType, TaskChart, TaskDefinition, TaskField, Weekday } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import { classifyEdit, validateDefinition, type EditClassification } from '@/lib/taskEdits'
import { effectiveFromForChange } from '@/lib/versions'
import { hasValue } from '@/lib/completionStatus'
import { AGG_LABELS } from '@/lib/charts'
import type { DateString } from '@/lib/periods'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import SelectField from '@/components/ui/SelectField.vue'
import DurationInput from '@/components/ui/DurationInput.vue'
import YesNoInput from '@/components/ui/YesNoInput.vue'
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
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
]
const PERIOD_NOUN: Record<Cadence, string> = { daily: 'day', weekly: 'week', monthly: 'month' }
const LIMITS = [
  { min: 'min', max: 'max', aria: 'Each entry', label: () => 'Each entry' },
  { min: 'totalMin', max: 'totalMax', aria: 'Total', label: (noun: string) => `Total per ${noun}` },
] as const
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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

const certainDays = computed({
  get: () => def.activeDays !== null,
  set: (v) => (def.activeDays = v ? [1, 2, 3, 4, 5] : null),
})
/** Plain-language summary of the schedule, so the three controls read as one idea. */
const scheduleSummary = computed(() => {
  const n = def.requiredCount
  const times = n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`
  if (def.cadence !== 'daily') return `${times[0]!.toUpperCase()}${times.slice(1)} every ${PERIOD_NOUN[def.cadence]}.`
  const days = def.activeDays
  let when = 'every day'
  if (days && days.length < 7) {
    const sorted = [...days].sort()
    if (sorted.join() === '1,2,3,4,5') when = 'on weekdays'
    else if (sorted.join() === '0,6') when = 'on weekends'
    else if (sorted.length === 0) when = 'on no days yet'
    else when = `on ${sorted.map((d) => WEEKDAY_NAMES[d]!.slice(0, 3)).join(', ')}`
  }
  return `${times[0]!.toUpperCase()}${times.slice(1)} a day, ${when}.`
})
function toggleDay(d: Weekday) {
  if (def.activeDays === null) return
  def.activeDays = def.activeDays.includes(d) ? def.activeDays.filter((x) => x !== d) : [...def.activeDays, d].sort()
}

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
  delete optionsText[f.key]
  def.charts = def.charts?.filter((c) => c.a !== f.key && c.b !== f.key)
}
function onLabelInput(f: TaskField) {
  // New fields take their key from the label until first saved; existing keys never change.
  if (!lockedKeys.value.has(f.key) && !props.current?.fieldKeys.includes(f.key)) {
    const old = f.key
    f.key = keyFor(f.label || 'field', def.fields.filter((x) => x !== f).map((x) => x.key))
    for (const c of def.charts ?? []) {
      if (c.a === old) c.a = f.key
      if (c.b === old) c.b = f.key
    }
  }
}

// ---- charts ----
const measureFields = computed(() => def.fields.filter((f) => f.type === 'number' || f.type === 'duration'))
const measureOptions = computed(() => measureFields.value.map((f) => ({ value: f.key, label: f.label || f.key })))
const OPS = [
  { value: '', label: 'on its own' },
  { value: '/', label: '÷ divided by' },
  { value: '*', label: '× times' },
]
const aggOptions = (c: TaskChart) =>
  (Object.keys(AGG_LABELS) as TaskChart['agg'][]).filter((a) => !(c.op === '/' && a === 'sum')).map((a) => ({ value: a, label: AGG_LABELS[a] }))
function addChart() {
  def.charts = [...(def.charts ?? []), { name: '', a: measureFields.value[0]?.key ?? '', agg: 'sum' }]
}
function setOp(c: TaskChart, op: string) {
  c.op = op === '/' || op === '*' ? op : undefined
  if (c.op && !c.b) c.b = measureFields.value.find((f) => f.key !== c.a)?.key ?? c.a
  // Adding up ratios means nothing, so a divided chart starts as an average.
  if (c.op === '/' && c.agg === 'sum') c.agg = 'avg'
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
    if (t === 'checkbox') def.fields = []
  },
)

const errors = computed(() => validateDefinition(normalized.value))
const normalized = computed<TaskDefinition>(() => ({
  ...def,
  name: def.name.trim(),
  description: def.description?.trim() || undefined,
  activeDays: def.cadence === 'daily' ? def.activeDays : null,
  fields: def.fields.map((f) => {
    const ranged = f.type === 'number' || f.type === 'duration'
    return {
      ...f,
      label: f.label.trim() || f.key,
      unit: f.type === 'number' ? f.unit?.trim() || undefined : undefined,
      min: ranged ? numOrUndef(f.min) : undefined,
      max: ranged ? numOrUndef(f.max) : undefined,
      totalMin: ranged ? numOrUndef(f.totalMin) : undefined,
      totalMax: ranged ? numOrUndef(f.totalMax) : undefined,
      step: f.type === 'number' ? numOrUndef(f.step) : undefined,
      options: f.type === 'select' ? f.options : undefined,
      default: defaultFor(f),
    }
  }),
  charts: def.completionType === 'fields' && def.charts?.length
    ? def.charts.map((c) => ({ name: c.name.trim(), a: c.a, op: c.op, b: c.op ? c.b : undefined, agg: c.agg }))
    : undefined,
}))
/** The default in the field's own type, or undefined; leftovers from a type change are dropped. */
function defaultFor(f: TaskField): unknown {
  const d = f.default
  switch (f.type) {
    case 'number':
    case 'duration':
      return numOrUndef(d)
    case 'boolean':
      return typeof d === 'boolean' ? d : undefined
    case 'select':
      return typeof d === 'string' && d ? d : undefined
    case 'text':
      return typeof d === 'string' && d.trim() ? d.trim() : undefined
  }
}
/** Plain-language result of the required and default settings, so admins see what the check button will do. */
const tapSummary = computed(() => {
  if (normalized.value.completionType !== 'fields' || normalized.value.fields.length === 0) return ''
  const blocking = normalized.value.fields.filter((f) => f.required && !hasValue(f.default))
  if (blocking.length === 0) return 'Tapping the check logs it in one tap, using any defaults.'
  return `Tapping the check opens the form, because ${blocking.map((f) => f.label).join(' and ')} ${blocking.length === 1 ? 'is' : 'are'} required with no default.`
})
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
    activeDays: c.activeDays, requiredCount: c.requiredCount, completionType: c.completionType, fields: c.fields, charts: c.charts }
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
      return 'A field’s type or unit cannot change. Replace the task instead: the current one ends and a new one starts.'
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
    <div>
      <p class="text-base font-semibold">How often</p>
      <p class="mt-1 text-sm text-muted-foreground">{{ scheduleSummary }}</p>
    </div>
    <div class="grid gap-1.5">
      <Label for="task-cadence">Repeats</Label>
      <SelectField id="task-cadence" v-model="def.cadence" :options="CADENCES" />
    </div>
    <div class="grid gap-1.5">
      <Label for="task-required">Times per {{ PERIOD_NOUN[def.cadence] }}</Label>
      <Input id="task-required" v-model.number="def.requiredCount" type="number" inputmode="numeric" min="1" step="1" class="max-w-32" />
      <p class="text-sm text-muted-foreground">
        How many qualifying entries the {{ PERIOD_NOUN[def.cadence] }} needs. Usually 1.
      </p>
    </div>

    <div v-if="def.cadence === 'daily'" class="grid gap-3">
      <div class="flex items-center justify-between gap-4">
        <div>
          <Label for="task-certaindays">Only on certain days</Label>
          <p class="text-sm text-muted-foreground">Skipped days don't count as missed.</p>
        </div>
        <Switch id="task-certaindays" :model-value="certainDays" @update:model-value="certainDays = $event" />
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
          <SelectField v-model="f.type" label="Field type" :options="FIELD_TYPES" :disabled="lockedKeys.has(f.key)" />
          <Input
            v-if="f.type === 'number'"
            v-model="f.unit"
            placeholder="Unit (mi, kcal)"
            :disabled="lockedKeys.has(f.key)"
          />
        </div>
        <Input
          v-if="f.type === 'select'"
          v-model="optionsText[f.key]"
          placeholder="Choices, comma separated"
          @input="syncOptions(f)"
        />
        <template v-if="f.type === 'number' || f.type === 'duration'">
          <div v-for="limit in LIMITS" :key="limit.min" class="grid gap-1">
            <p class="text-xs font-semibold text-muted-foreground">{{ limit.label(PERIOD_NOUN[def.cadence]) }}</p>
            <div class="grid gap-2" :class="f.type === 'number' ? 'grid-cols-2' : 'grid-cols-1'">
              <template v-for="side in [limit.min, limit.max]" :key="side">
                <Input
                  v-if="f.type === 'number'"
                  :id="`${side}-${i}`"
                  :model-value="(f[side] as number | string | undefined)"
                  :aria-label="`${limit.aria} ${side === limit.min ? 'min' : 'max'}`"
                  type="number"
                  inputmode="decimal"
                  step="any"
                  :placeholder="side === limit.min ? 'Min' : 'Max'"
                  @update:model-value="f[side] = $event as number"
                />
                <div v-else class="flex items-center gap-3">
                  <span class="w-8 text-xs text-muted-foreground">{{ side === limit.min ? 'Min' : 'Max' }}</span>
                  <DurationInput
                    :id="`${side}-${i}`"
                    :model-value="f[side] ?? null"
                    :aria-label="`${limit.aria} ${side === limit.min ? 'min' : 'max'}`"
                    @update:model-value="f[side] = $event ?? undefined"
                  />
                </div>
              </template>
            </div>
          </div>
          <p class="-mt-1 text-xs text-muted-foreground">
            An entry outside the each-entry limits is saved but doesn’t qualify. The total adds up every entry in the {{ PERIOD_NOUN[def.cadence] }}.
          </p>
        </template>
        <div v-if="f.type === 'number'" class="grid gap-1">
          <Label :for="`step-${i}`" class="text-xs text-muted-foreground">Round to</Label>
          <Input :id="`step-${i}`" v-model="f.step" type="number" inputmode="decimal" step="any" min="0" placeholder="Exact" class="max-w-40" />
          <p class="text-xs text-muted-foreground">0.1 for one decimal place, 5 for the nearest 5.</p>
        </div>
        <div class="grid gap-1">
          <Label :for="`default-${i}`" class="text-xs text-muted-foreground">Default</Label>
          <Input v-if="f.type === 'number'" :id="`default-${i}`" :model-value="(f.default as number | string | undefined)" type="number" inputmode="decimal" step="any" placeholder="None" @update:model-value="f.default = $event" />
          <DurationInput v-else-if="f.type === 'duration'" :id="`default-${i}`" aria-label="Default" :model-value="typeof f.default === 'number' ? f.default : null" @update:model-value="f.default = $event ?? undefined" />
          <YesNoInput v-else-if="f.type === 'boolean'" :id="`default-${i}`" label="Default" :model-value="typeof f.default === 'boolean' ? f.default : null" @update:model-value="f.default = $event ?? undefined" />
          <SelectField
            v-else-if="f.type === 'select'"
            :id="`default-${i}`"
            :model-value="typeof f.default === 'string' ? f.default : ''"
            :options="[{ value: '', label: 'None' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]"
            @update:model-value="f.default = $event || undefined"
          />
          <Input v-else :id="`default-${i}`" :model-value="typeof f.default === 'string' ? f.default : ''" placeholder="None" @update:model-value="f.default = String($event)" />
        </div>
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

      <p v-if="tapSummary" class="text-sm text-muted-foreground">{{ tapSummary }}</p>
    </div>
    </div>

    <div v-if="def.completionType === 'fields' && measureFields.length" class="panel grid gap-4 p-4">
      <div>
        <p class="text-base font-semibold">Charts</p>
        <p class="mt-1 text-sm text-muted-foreground">
          What everyone sees on the Stats page. Divide two fields for things like time per mile.
          <template v-if="!def.charts?.length"> With none set, Stats shows only entries per week and completion rate.</template>
        </p>
      </div>
      <div v-for="(c, i) in def.charts ?? []" :key="i" class="grid gap-3 rounded-xl bg-muted/60 p-3">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <Input v-model="c.name" :aria-label="`Chart ${i + 1} name`" placeholder="Name (e.g. Pace)" maxlength="40" />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove chart" @click="def.charts!.splice(i, 1)">
            <PhTrash :size="18" />
          </Button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <SelectField v-model="c.a" :label="`Chart ${i + 1} field`" :options="measureOptions" />
          <SelectField :model-value="c.op ?? ''" :label="`Chart ${i + 1} operation`" :options="OPS" @update:model-value="setOp(c, $event)" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <SelectField v-if="c.op" :model-value="c.b ?? ''" :label="`Chart ${i + 1} second field`" :options="measureOptions" @update:model-value="c.b = $event" />
          <div :class="c.op ? '' : 'col-span-2'">
            <SelectField v-model="c.agg" :label="`Chart ${i + 1} combine`" :options="aggOptions(c)" />
          </div>
        </div>
      </div>
      <Button type="button" variant="outline" @click="addChart">
        <PhPlus :size="16" weight="bold" />
        Add chart
      </Button>
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
