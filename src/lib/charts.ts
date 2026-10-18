import type { TaskChart, TaskField, Weekday } from '@/types/task'
import type { Completion, CompletionValues } from '@/types/completion'
import { formatValue } from './completionStatus'
import { bucketKey, bucketLabel, bucketsInRange, type Bucket, type SeriesPoint } from './stats'
import type { DateString } from './periods'

export const AGG_LABELS: Record<TaskChart['agg'], string> = { sum: 'Total', avg: 'Average', min: 'Min', max: 'Max' }

/**
 * How a chart's numbers read, worked out from field types alone: a duration over a number is time
 * per unit, a number over a duration is per hour, and anything else is a plain number.
 */
export interface ChartFormat {
  kind: 'number' | 'duration'
  /** appended after the value, such as " /mi" or " mi/h" */
  suffix: string
  /** multiplies the raw value; 3600 turns per-second into per-hour */
  scale: number
}

export function chartFormat(chart: TaskChart, fields: TaskField[]): ChartFormat {
  const a = fields.find((f) => f.key === chart.a)
  const b = chart.op ? fields.find((f) => f.key === chart.b) : undefined
  if (!a) return { kind: 'number', suffix: '', scale: 1 }
  if (!chart.op || !b) return { kind: a.type === 'duration' ? 'duration' : 'number', suffix: a.unit ? ` ${a.unit}` : '', scale: 1 }
  if (chart.op === '*') return { kind: a.type === 'duration' || b.type === 'duration' ? 'duration' : 'number', suffix: '', scale: 1 }
  if (a.type === 'duration' && b.type === 'number') return { kind: 'duration', suffix: ` /${b.unit || b.label}`, scale: 1 }
  if (a.type === 'number' && b.type === 'duration') return { kind: 'number', suffix: ` ${a.unit || a.label}/h`, scale: 3600 }
  return { kind: 'number', suffix: a.unit && b.unit ? ` ${a.unit}/${b.unit}` : '', scale: 1 }
}

export function formatChartValue(value: number | null, format: ChartFormat): string {
  if (value === null) return '—'
  if (format.kind === 'duration') return `${formatValue(Math.round(value), 'duration')}${format.suffix}`
  return `${+value.toFixed(2)}${format.suffix}`
}

/** The chart's value for one entry, or null when a field it needs is blank (or a divisor is zero). */
export function entryValue(chart: TaskChart, values: CompletionValues): number | null {
  const a = values[chart.a]
  if (typeof a !== 'number') return null
  if (!chart.op) return a
  const b = values[chart.b ?? '']
  if (typeof b !== 'number') return null
  if (chart.op === '*') return a * b
  return b === 0 ? null : a / b
}

/**
 * Combines entries. An average of a ratio is total ÷ total, so a long run weighs more than a short one;
 * min and max use each entry's own value. Returns the scaled value and how many entries it covers.
 */
export function aggregate(chart: TaskChart, entries: CompletionValues[], scale = 1): { value: number | null; entries: number } {
  const usable = entries.filter((v) => entryValue(chart, v) !== null)
  if (usable.length === 0) return { value: null, entries: 0 }
  const each = usable.map((v) => entryValue(chart, v)!)
  let value: number
  if (chart.agg === 'avg' && chart.op === '/') {
    const sumA = usable.reduce((t, v) => t + (v[chart.a] as number), 0)
    const sumB = usable.reduce((t, v) => t + (v[chart.b!] as number), 0)
    value = sumA / sumB
  } else if (chart.agg === 'avg') value = each.reduce((t, n) => t + n, 0) / each.length
  else if (chart.agg === 'min') value = Math.min(...each)
  else if (chart.agg === 'max') value = Math.max(...each)
  else value = each.reduce((t, n) => t + n, 0)
  return { value: value * scale, entries: usable.length }
}

function live(completions: Completion[], from: DateString, to: DateString): Completion[] {
  return completions.filter((c) => {
    const day = c.periodKey.slice(2)
    return !c.deletedAt && day >= from && day <= to
  })
}

/** The chart's value over a whole date range, for the stats card. Every logged entry is included, counting or not. */
export function chartSummary(chart: TaskChart, completions: Completion[], from: DateString, to: DateString, scale = 1) {
  return aggregate(chart, live(completions, from, to).map((c) => c.values), scale)
}

/** The chart's value per week or month, with empty buckets as null. */
export function chartSeries(
  chart: TaskChart,
  completions: Completion[],
  opts: { from: DateString; to: DateString; bucket: Bucket; weekStartsOn: Weekday; scale?: number },
): SeriesPoint[] {
  const byBucket = new Map<string, CompletionValues[]>()
  for (const c of live(completions, opts.from, opts.to)) {
    const key = bucketKey(c.periodKey.slice(2), opts.bucket, opts.weekStartsOn)
    byBucket.set(key, [...(byBucket.get(key) ?? []), c.values])
  }
  return bucketsInRange(opts.from, opts.to, opts.bucket, opts.weekStartsOn).map((key) => ({
    key,
    label: bucketLabel(key, opts.bucket),
    value: aggregate(chart, byBucket.get(key) ?? [], opts.scale).value,
  }))
}
