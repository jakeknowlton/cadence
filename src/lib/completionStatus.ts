import type { TaskSnapshot } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'

export function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}

export function missingRequiredFields(snapshot: TaskSnapshot, values: CompletionValues): string[] {
  return snapshot.fields.filter((f) => f.required && !hasValue(values[f.key])).map((f) => f.key)
}

export interface OutOfRange {
  key: string
  /** which limit the value crossed */
  side: 'min' | 'max'
  limit: number
}

/** Entered number and duration values outside their field's min or max. Blank values are never out of range. */
export function outOfRangeFields(snapshot: TaskSnapshot, values: CompletionValues): OutOfRange[] {
  const out: OutOfRange[] = []
  for (const f of snapshot.fields) {
    if (f.type !== 'number' && f.type !== 'duration') continue
    const v = values[f.key]
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    if (f.min !== undefined && v < f.min) out.push({ key: f.key, side: 'min', limit: f.min })
    else if (f.max !== undefined && v > f.max) out.push({ key: f.key, side: 'max', limit: f.max })
  }
  return out
}

/** A completion counts when every required field has a value and every entered value is within its min and max. */
export function isCounting(snapshot: TaskSnapshot, values: CompletionValues): boolean {
  return missingRequiredFields(snapshot, values).length === 0 && outOfRangeFields(snapshot, values).length === 0
}

/** Values for a one-tap log: every field's default, or null if a required field has no default. */
export function quickValues(snapshot: TaskSnapshot): CompletionValues | null {
  if (snapshot.fields.some((f) => f.required && !hasValue(f.default))) return null
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

/** Parses "45", "12:30", or "1:02:05" into seconds; null if blank or not a duration. */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t || !/^\d+(:\d{1,2}){0,2}$/.test(t)) return null
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0)
}

export function formatValue(value: unknown, type: string, unit?: string): string {
  if (!hasValue(value)) return ''
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
