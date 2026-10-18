import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskChart, TaskField } from '@/types/task'
import type { Completion, CompletionValues } from '@/types/completion'
import { aggregate, chartFormat, chartSeries, chartSummary, entryValue, formatChartValue } from './charts'

const fields: TaskField[] = [
  { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true },
  { key: 'time', label: 'Time', type: 'duration', required: false },
  { key: 'sets', label: 'Sets', type: 'number', required: false },
  { key: 'reps', label: 'Reps', type: 'number', required: false },
  { key: 'note', label: 'Note', type: 'text', required: false },
]
const pace: TaskChart = { name: 'Pace', a: 'time', op: '/', b: 'miles', agg: 'avg' }
const speed: TaskChart = { name: 'Speed', a: 'miles', op: '/', b: 'time', agg: 'avg' }
const total: TaskChart = { name: 'Total reps', a: 'sets', op: '*', b: 'reps', agg: 'sum' }

function c(day: string, values: CompletionValues, deleted = false): Completion {
  return { id: day, userId: 'u', groupId: 'g', taskId: 't', taskVersionId: 'v', taskName: 'Run', cadence: 'daily', periodKey: `d:${day}`, weekStartsOn: 1,
    completedAt: Timestamp.now(), loggedAt: Timestamp.now(), values, note: null, taskSnapshot: { cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields', fields },
    deletedAt: deleted ? Timestamp.now() : null }
}

describe('entryValue', () => {
  it('needs every field it uses, and never divides by zero', () => {
    expect(entryValue(pace, { time: 600, miles: 1.2 })).toBe(500)
    expect(entryValue(pace, { miles: 1.2 })).toBeNull()
    expect(entryValue(pace, { time: 600, miles: 0 })).toBeNull()
    expect(entryValue(total, { sets: 3, reps: 10 })).toBe(30)
  })
})

describe('aggregate', () => {
  const runs: CompletionValues[] = [{ time: 2700, miles: 5 }, { time: 150, miles: 0.25 }, { miles: 2 }]
  it('averages a ratio as total over total, so longer entries weigh more', () => {
    expect(aggregate(pace, runs)).toEqual({ value: 2850 / 5.25, entries: 2 })
  })
  it('min and max use each entry on its own', () => {
    expect(aggregate({ ...pace, agg: 'min' }, runs).value).toBe(540)
    expect(aggregate({ ...pace, agg: 'max' }, runs).value).toBe(600)
  })
  it('totals and averages plain and multiplied values', () => {
    expect(aggregate({ name: 'Distance', a: 'miles', agg: 'sum' }, runs)).toEqual({ value: 7.25, entries: 3 })
    expect(aggregate({ name: 'Distance', a: 'miles', agg: 'avg' }, runs).value).toBeCloseTo(7.25 / 3)
    expect(aggregate(total, [{ sets: 3, reps: 10 }, { sets: 2, reps: 8 }]).value).toBe(46)
  })
  it('is empty with no usable entries, and applies the scale', () => {
    expect(aggregate(pace, [{ miles: 1 }])).toEqual({ value: null, entries: 0 })
    expect(aggregate(speed, [{ miles: 3, time: 1800 }], 3600).value).toBe(6)
  })
})

describe('chartFormat', () => {
  it('reads from field types: time per unit, per hour, plain', () => {
    expect(formatChartValue(552, chartFormat(pace, fields))).toBe('9:12 /mi')
    expect(formatChartValue(6.5, chartFormat(speed, fields))).toBe('6.5 mi/h')
    expect(formatChartValue(30, chartFormat(total, fields))).toBe('30')
    expect(formatChartValue(12.5, chartFormat({ name: 'Distance', a: 'miles', agg: 'sum' }, fields))).toBe('12.5 mi')
    expect(formatChartValue(3725, chartFormat({ name: 'Time', a: 'time', agg: 'sum' }, fields))).toBe('1:02:05')
    expect(formatChartValue(null, chartFormat(pace, fields))).toBe('—')
  })
})

describe('chartSeries and chartSummary', () => {
  const completions = [
    c('2026-10-05', { time: 600, miles: 1 }),
    c('2026-10-07', { time: 1080, miles: 2 }),
    c('2026-10-13', { time: 500, miles: 1 }),
    c('2026-10-14', { time: 9999, miles: 1 }, true),
  ]
  it('buckets by week, skips deleted entries, and leaves empty weeks null', () => {
    const points = chartSeries(pace, completions, { from: '2026-09-28', to: '2026-10-18', bucket: 'week', weekStartsOn: 1 })
    expect(points.map((p) => p.value)).toEqual([null, 1680 / 3, 500])
  })
  it('summarises the whole range', () => {
    expect(chartSummary(pace, completions, '2026-10-01', '2026-10-31')).toEqual({ value: 2180 / 4, entries: 3 })
  })
})
