import type { Cadence, Weekday } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import type { Completion } from '@/types/completion'
import { isCounting } from './completionStatus'
import { isActiveDay, periodFor, periodsInRange, type DateString, type Period } from './periods'
import { versionInEffect } from './versions'

export type PeriodOutcome = 'complete' | 'missed' | 'inactive' | 'pending'

export interface PeriodResult {
  period: Period
  outcome: PeriodOutcome
  count: number
  required: number
}

export interface Segment {
  cadence: Cadence
  from: DateString
  to: DateString | null
}

export interface SegmentStats extends Segment {
  periods: PeriodResult[]
  complete: number
  missed: number
  /** complete / (complete + missed), null when nothing has closed yet */
  completionRate: number | null
  currentStreak: number
  longestStreak: number
}

export interface FieldStats {
  key: string
  count: number
  sum: number
  avg: number
  min: number
  max: number
}

export interface StatsInput {
  /** every version of one task lineage */
  versions: TaskVersionDoc[]
  /** this member's completions for that task */
  completions: Completion[]
  joinedOn: DateString
  leftOn: DateString | null
  from: DateString
  to: DateString
  today: DateString
  weekStartsOn: Weekday
}

/** Consecutive versions sharing a cadence, merged into one range each. */
export function cadenceSegments(versions: TaskVersionDoc[]): Segment[] {
  const sorted = [...versions].sort((a, b) => a.version - b.version)
  const out: Segment[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last && last.cadence === v.cadence) last.to = v.effectiveTo
    else out.push({ cadence: v.cadence, from: v.effectiveFrom, to: v.effectiveTo })
  }
  return out
}

function minDate(...ds: (DateString | null)[]): DateString {
  return ds.filter((d): d is DateString => !!d).sort()[0]!
}
function maxDate(...ds: DateString[]): DateString {
  return [...ds].sort().at(-1)!
}

export function periodResults(seg: Segment, input: StatsInput): PeriodResult[] {
  const from = maxDate(seg.from, input.from, input.joinedOn)
  const to = minDate(seg.to, input.to, input.leftOn, input.today)
  if (from > to) return []
  const byKey = new Map<string, Completion[]>()
  for (const c of input.completions) {
    if (c.deletedAt) continue
    const list = byKey.get(c.periodKey) ?? []
    list.push(c)
    byKey.set(c.periodKey, list)
  }
  return periodsInRange(from, to, seg.cadence, input.weekStartsOn).map((period) => {
    const version = versionInEffect(input.versions, input.versions[0]!.taskId, period.start)
    const inactive =
      !version ||
      version.cadence !== seg.cadence ||
      (seg.cadence === 'daily' && !isActiveDay(period.start, version.activeDays)) ||
      period.end < input.joinedOn ||
      (input.leftOn !== null && period.start > input.leftOn)
    const required = version?.requiredCount ?? 1
    const count = (byKey.get(period.key) ?? []).filter((c) => isCounting(c.taskSnapshot, c.values)).length
    let outcome: PeriodOutcome
    if (inactive) outcome = 'inactive'
    else if (count >= required) outcome = 'complete'
    else if (period.end >= input.today) outcome = 'pending'
    else outcome = 'missed'
    return { period, outcome, count, required }
  })
}

export function streaks(results: PeriodResult[]): { current: number; longest: number } {
  let longest = 0
  let run = 0
  for (const r of results) {
    if (r.outcome === 'inactive' || r.outcome === 'pending') continue
    if (r.outcome === 'complete') run += 1
    else run = 0
    longest = Math.max(longest, run)
  }
  // current: walk back from the end; an incomplete current period is skipped, not a break
  let current = 0
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i]!
    if (r.outcome === 'inactive') continue
    if (r.outcome === 'pending') continue
    if (r.outcome === 'complete') current += 1
    else break
  }
  return { current, longest: Math.max(longest, current) }
}

export function segmentStats(seg: Segment, input: StatsInput): SegmentStats {
  const periods = periodResults(seg, input)
  const complete = periods.filter((p) => p.outcome === 'complete').length
  const missed = periods.filter((p) => p.outcome === 'missed').length
  const closed = complete + missed
  const { current, longest } = streaks(periods)
  return {
    ...seg,
    periods,
    complete,
    missed,
    completionRate: closed === 0 ? null : complete / closed,
    currentStreak: current,
    longestStreak: longest,
  }
}

export function fieldStats(completions: Completion[], from: DateString, to: DateString): FieldStats[] {
  const acc = new Map<string, number[]>()
  for (const c of completions) {
    if (c.deletedAt) continue
    const day = c.periodKey.slice(2)
    if (day < from || day > to) continue
    for (const f of c.taskSnapshot.fields) {
      if (f.type !== 'number' && f.type !== 'duration') continue
      const v = c.values[f.key]
      if (typeof v !== 'number') continue
      const list = acc.get(f.key) ?? []
      list.push(v)
      acc.set(f.key, list)
    }
  }
  return [...acc.entries()].map(([key, vs]) => ({
    key,
    count: vs.length,
    sum: vs.reduce((a, b) => a + b, 0),
    avg: vs.reduce((a, b) => a + b, 0) / vs.length,
    min: Math.min(...vs),
    max: Math.max(...vs),
  }))
}

export function computeStats(input: StatsInput): { segments: SegmentStats[]; fields: FieldStats[] } {
  const segs = cadenceSegments(input.versions).map((s) => segmentStats(s, input))
  return { segments: segs.filter((s) => s.periods.length > 0), fields: fieldStats(input.completions, input.from, input.to) }
}

// ---------- chart series ----------

export type Bucket = 'week' | 'month'

export interface SeriesPoint {
  key: string
  label: string
  value: number | null
}

export function bucketKey(day: DateString, bucket: Bucket, weekStartsOn: Weekday): string {
  return periodFor(day, bucket === 'week' ? 'weekly' : 'monthly', weekStartsOn).start
}

function bucketLabel(start: DateString, bucket: Bucket): string {
  const [y, m, d] = start.split('-')
  return bucket === 'month' ? `${y}-${m}` : `${m}/${d}`
}

/** One bucket per week or month across [from, to], even when empty. */
export function bucketsInRange(from: DateString, to: DateString, bucket: Bucket, weekStartsOn: Weekday): string[] {
  return periodsInRange(from, to, bucket === 'week' ? 'weekly' : 'monthly', weekStartsOn).map((p) => p.start)
}

/** Sum or average of a numeric field per bucket, or the count of counting completions. */
export function valueSeries(
  completions: Completion[],
  opts: { from: DateString; to: DateString; bucket: Bucket; weekStartsOn: Weekday; fieldKey?: string; agg: 'sum' | 'avg' | 'count' },
): SeriesPoint[] {
  const acc = new Map<string, number[]>()
  for (const c of completions) {
    if (c.deletedAt) continue
    const day = c.periodKey.slice(2)
    if (day < opts.from || day > opts.to) continue
    const key = bucketKey(day, opts.bucket, opts.weekStartsOn)
    if (opts.agg === 'count') {
      if (!isCounting(c.taskSnapshot, c.values)) continue
      acc.set(key, [...(acc.get(key) ?? []), 1])
    } else {
      const v = c.values[opts.fieldKey ?? '']
      if (typeof v !== 'number') continue
      acc.set(key, [...(acc.get(key) ?? []), v])
    }
  }
  return bucketsInRange(opts.from, opts.to, opts.bucket, opts.weekStartsOn).map((key) => {
    const vs = acc.get(key)
    let value: number | null
    if (!vs) value = opts.agg === 'count' ? 0 : null
    else if (opts.agg === 'avg') value = vs.reduce((a, b) => a + b, 0) / vs.length
    else value = vs.reduce((a, b) => a + b, 0)
    return { key, label: bucketLabel(key, opts.bucket), value }
  })
}

/** Completion rate per month from segment results (closed periods only). */
export function rateSeries(segments: SegmentStats[], from: DateString, to: DateString): SeriesPoint[] {
  const acc = new Map<string, { c: number; m: number }>()
  for (const s of segments) {
    for (const p of s.periods) {
      if (p.outcome !== 'complete' && p.outcome !== 'missed') continue
      const key = p.period.start.slice(0, 7) + '-01'
      const cur = acc.get(key) ?? { c: 0, m: 0 }
      if (p.outcome === 'complete') cur.c += 1
      else cur.m += 1
      acc.set(key, cur)
    }
  }
  return bucketsInRange(from, to, 'month', 1).map((key) => {
    const v = acc.get(key)
    return { key, label: bucketLabel(key, 'month'), value: v ? v.c / (v.c + v.m) : null }
  })
}
