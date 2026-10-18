import type { TaskSnapshot } from '@/types/group'
import type { Completion, CompletionValues } from '@/types/completion'

export function hasValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}

export function missingRequiredFields(snapshot: TaskSnapshot, values: CompletionValues): string[] {
  return snapshot.fields.filter((f) => f.required && !hasValue(values[f.key])).map((f) => f.key)
}

const isMeasure = (type: string) => type === 'number' || type === 'duration'

export interface EntryMiss {
  key: string
  /** which per-entry limit the value missed */
  side: 'min' | 'max'
  limit: number
  /** the field was left blank, so it can't meet the limit */
  blank: boolean
}

/** Per-entry limits this entry misses. A blank value misses any limit on its field. */
export function entryMisses(snapshot: TaskSnapshot, values: CompletionValues): EntryMiss[] {
  const out: EntryMiss[] = []
  for (const f of snapshot.fields) {
    if (!isMeasure(f.type) || (f.min === undefined && f.max === undefined)) continue
    const v = values[f.key]
    const blank = typeof v !== 'number' || Number.isNaN(v)
    if (f.min !== undefined && (blank || v < f.min)) out.push({ key: f.key, side: 'min', limit: f.min, blank })
    else if (f.max !== undefined && (blank || v > f.max)) out.push({ key: f.key, side: 'max', limit: f.max, blank })
  }
  return out
}

/** An entry qualifies when it meets every per-entry limit on the task at once. */
export function qualifies(snapshot: TaskSnapshot, values: CompletionValues): boolean {
  return entryMisses(snapshot, values).length === 0
}

export interface PeriodTotal {
  key: string
  sum: number
  min?: number
  max?: number
  ok: boolean
}

/** Sums of every field with a period total limit, over all the period's entries, qualifying or not. */
export function periodTotals(snapshot: TaskSnapshot, entries: CompletionValues[]): PeriodTotal[] {
  return snapshot.fields
    .filter((f) => isMeasure(f.type) && (f.totalMin !== undefined || f.totalMax !== undefined))
    .map((f) => {
      const sum = entries.reduce((t, v) => t + (typeof v[f.key] === 'number' ? (v[f.key] as number) : 0), 0)
      const ok = (f.totalMin === undefined || sum >= f.totalMin) && (f.totalMax === undefined || sum <= f.totalMax)
      return { key: f.key, sum, min: f.totalMin, max: f.totalMax, ok }
    })
}

/** Values for a one-tap log: every field's default, or null if a required field has no default. */
export function quickValues(snapshot: TaskSnapshot): CompletionValues | null {
  if (snapshot.fields.some((f) => f.required && !hasValue(f.default))) return null
  return Object.fromEntries(snapshot.fields.map((f) => [f.key, (f.default as CompletionValues[string]) ?? null]))
}

export interface PeriodStatus {
  /** qualifying entries */
  count: number
  /** all non-deleted entries */
  total: number
  required: number
  totals: PeriodTotal[]
  /** enough qualifying entries, and every period total within its limits */
  complete: boolean
}

/** Judges a period's entries by the task settings in effect for that period. */
export function periodStatus(snapshot: TaskSnapshot, completions: Completion[]): PeriodStatus {
  const live = completions.filter((c) => !c.deletedAt)
  const count = live.filter((c) => qualifies(snapshot, c.values)).length
  const totals = periodTotals(snapshot, live.map((c) => c.values))
  return {
    count,
    total: live.length,
    required: snapshot.requiredCount,
    totals,
    complete: count >= snapshot.requiredCount && totals.every((t) => t.ok),
  }
}

/** Progress toward a period total, such as "60 / 100 reps" or "1850 of 2200 kcal max". */
export function totalProgress(t: PeriodTotal, field: { type: string; unit?: string }): string {
  const fmt = (n: number) => formatValue(n, field.type, field.unit)
  if (t.min !== undefined) return `${fmt(t.sum)} / ${fmt(t.min)}`
  return `${fmt(t.sum)} of ${fmt(t.max!)} max`
}

/** Rounds to the nearest multiple of `step`, keeping only the decimals the step has (so 0.1 steps never give 0.30000000000000004). */
export function roundToStep(value: number, step: number | undefined): number {
  if (!step || !(step > 0)) return value
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(value / step) * step).toFixed(decimals))
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
