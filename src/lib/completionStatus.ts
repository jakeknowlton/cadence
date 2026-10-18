import type { TaskSnapshot } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}

export function missingRequiredFields(snapshot: TaskSnapshot, values: CompletionValues): string[] {
  return snapshot.fields.filter((f) => f.required && !present(values[f.key])).map((f) => f.key)
}

/** true/false if the target can be evaluated, null if there is no target or the field is empty. */
export function targetMet(snapshot: TaskSnapshot, values: CompletionValues): boolean | null {
  const t = snapshot.target
  if (!t) return null
  const raw = values[t.fieldKey]
  if (!present(raw) || typeof raw !== 'number') return null
  switch (t.comparator) {
    case '>=':
      return raw >= t.value
    case '<=':
      return raw <= t.value
    case '==':
      return raw === t.value
    case 'between':
      return raw >= t.value && raw <= (t.valueMax ?? t.value)
  }
}

/** A completion counts when required fields are present and the goal, if any, is met. */
export function isCounting(snapshot: TaskSnapshot, values: CompletionValues): boolean {
  if (missingRequiredFields(snapshot, values).length > 0) return false
  return targetMet(snapshot, values) !== false
}

/** Values for a one-tap log: every field's default, or null if there is nothing to default or a required field has none. */
export function quickValues(snapshot: TaskSnapshot): CompletionValues | null {
  if (!snapshot.fields.some((f) => present(f.default))) return null
  if (snapshot.fields.some((f) => f.required && !present(f.default))) return null
  return Object.fromEntries(snapshot.fields.map((f) => [f.key, (f.default as CompletionValues[string]) ?? null]))
}

export interface PeriodStatus {
  /** counting completions */
  count: number
  /** all non-deleted completions */
  total: number
  required: number
  complete: boolean
}

export function periodStatus(snapshot: TaskSnapshot, completions: Completion[]): PeriodStatus {
  const live = completions.filter((c) => !c.deletedAt)
  const counting = live.filter((c) => isCounting(c.taskSnapshot, c.values))
  return {
    count: counting.length,
    total: live.length,
    required: snapshot.requiredCount,
    complete: counting.length >= snapshot.requiredCount,
  }
}

/** Rounds to the nearest multiple of `step`, keeping only the decimals the step has (so 0.1 steps never give 0.30000000000000004). */
export function roundToStep(value: number, step: number | undefined): number {
  if (!step || !(step > 0)) return value
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

export function formatValue(value: unknown, type: string, unit?: string): string {
  if (!present(value)) return ''
  if (type === 'duration' && typeof value === 'number') {
    const h = Math.floor(value / 3600)
    const m = Math.floor((value % 3600) / 60)
    const s = Math.round(value % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
  if (type === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return unit ? `${value} ${unit}` : String(value)
  return String(value)
}
