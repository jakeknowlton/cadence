import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskVersionDoc } from '@/types/group'
import type { TaskDefinition } from '@/types/task'
import type { Completion } from '@/types/completion'
import { cadenceSegments, computeStats, rateSeries, streaks, valueSeries, type StatsInput } from './stats'
import { newTaskVersion } from './versions'
import { periodKey } from './periods'

const runDef: TaskDefinition = {
  name: 'Run', sortOrder: 1, cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: false }],
}
function v(id: string, def: TaskDefinition, from: string, to: string | null, version = 1): TaskVersionDoc {
  return { ...newTaskVersion(def, { taskId: 't', effectiveFrom: from, createdBy: 'u' }), id, version, effectiveTo: to, createdAt: Timestamp.now() } as TaskVersionDoc
}
function done(version: TaskVersionDoc, day: string, miles?: number): Completion {
  return { id: `${day}-${Math.random()}`, userId: 'u', groupId: 'g', taskId: 't', taskVersionId: version.id, taskName: 'Run', cadence: version.cadence,
    periodKey: periodKey(day, version.cadence, 1), weekStartsOn: 1, completedAt: Timestamp.now(), loggedAt: Timestamp.now(),
    values: miles === undefined ? {} : { miles }, note: null, taskSnapshot: version.snapshot, deletedAt: null }
}

const base: Omit<StatsInput, 'versions' | 'completions'> = { joinedOn: '2026-01-01', leftOn: null, from: '2026-10-05', to: '2026-10-15', today: '2026-10-15', weekStartsOn: 1 }

describe('cadenceSegments', () => {
  it('merges consecutive same-cadence versions', () => {
    const a = v('a', runDef, '2026-01-01', '2026-03-31', 1)
    const b = v('b', runDef, '2026-04-01', '2026-06-30', 2)
    const c = v('c', { ...runDef, cadence: 'weekly' }, '2026-07-01', null, 3)
    expect(cadenceSegments([c, a, b])).toEqual([
      { cadence: 'daily', from: '2026-01-01', to: '2026-06-30' },
      { cadence: 'weekly', from: '2026-07-01', to: null },
    ])
  })
})

describe('computeStats', () => {
  it('counts complete, missed, pending, and streaks for a daily task', () => {
    const run = v('v1', runDef, '2026-01-01', null)
    // Oct 5–15: done 5,6,7, missed 8, done 9..14, today (15) not yet
    const days = ['05', '06', '07', '09', '10', '11', '12', '13', '14'].map((d) => `2026-10-${d}`)
    const { segments } = computeStats({ ...base, versions: [run], completions: days.map((d) => done(run, d, 1)) })
    expect(segments).toHaveLength(1)
    const s = segments[0]!
    expect(s.complete).toBe(9)
    expect(s.missed).toBe(1)
    expect(s.periods.at(-1)?.outcome).toBe('pending')
    expect(s.completionRate).toBeCloseTo(0.9)
    expect(s.currentStreak).toBe(6)
    expect(s.longestStreak).toBe(6)
  })

  it('a complete current period extends the current streak', () => {
    const run = v('v1', runDef, '2026-01-01', null)
    const { segments } = computeStats({ ...base, versions: [run], completions: ['2026-10-14', '2026-10-15'].map((d) => done(run, d)) })
    expect(segments[0]!.currentStreak).toBe(2)
  })

  it('inactive days (weekday-only) and days before joining are skipped, not broken', () => {
    const weekdays = v('v1', { ...runDef, activeDays: [1, 2, 3, 4, 5] }, '2026-01-01', null)
    // Oct 5 (Mon) .. Oct 15 (Thu); weekends Oct 10, 11 inactive; joined Oct 7
    const days = ['07', '08', '09', '12', '13', '14'].map((d) => `2026-10-${d}`)
    const { segments } = computeStats({ ...base, joinedOn: '2026-10-07', versions: [weekdays], completions: days.map((d) => done(weekdays, d)) })
    const s = segments[0]!
    // periods before joining are not listed at all; weekend days are inactive
    expect(s.periods[0]!.period.start).toBe('2026-10-07')
    expect(s.periods.filter((p) => p.outcome === 'inactive').map((p) => p.period.start)).toEqual(['2026-10-10', '2026-10-11'])
    expect(s.missed).toBe(0)
    expect(s.currentStreak).toBe(6)
  })

  it('reports separate segments across a cadence change and never mixes them', () => {
    const daily = v('v1', runDef, '2026-01-01', '2026-10-11', 1)
    const weekly = v('v2', { ...runDef, cadence: 'weekly', requiredCount: 2 }, '2026-10-12', null, 2)
    const completions = [done(daily, '2026-10-09'), done(daily, '2026-10-10'), done(weekly, '2026-10-13'), done(weekly, '2026-10-14')]
    const { segments } = computeStats({ ...base, versions: [daily, weekly], completions })
    expect(segments.map((s) => s.cadence)).toEqual(['daily', 'weekly'])
    expect(segments[0]!.complete).toBe(2)
    expect(segments[0]!.missed).toBe(5) // Oct 5,6,7,8,11
    expect(segments[1]!.periods[0]!).toMatchObject({ outcome: 'complete', count: 2, required: 2 })
    expect(segments[1]!.currentStreak).toBe(1)
  })

  it('judges each period by the version in effect, adding entries toward a total', () => {
    const totalDef: TaskDefinition = { ...runDef, fields: [{ ...runDef.fields[0]!, totalMin: 2 }] }
    const run = v('v1', totalDef, '2026-01-01', null)
    const entries = [done(run, '2026-10-13', 1), done(run, '2026-10-13', 1), done(run, '2026-10-14', 1.5)]
    const { segments } = computeStats({ ...base, from: '2026-10-13', versions: [run], completions: entries })
    expect(segments[0]!.periods.map((p) => p.outcome)).toEqual(['complete', 'missed', 'pending'])
  })

  it('aggregates numeric fields across all completions in range', () => {
    const run = v('v1', runDef, '2026-01-01', null)
    const { fields } = computeStats({ ...base, versions: [run], completions: [done(run, '2026-10-10', 1), done(run, '2026-10-11', 3), done(run, '2026-09-01', 100)] })
    expect(fields).toEqual([{ key: 'miles', count: 2, sum: 4, avg: 2, min: 1, max: 3 }])
  })
})

describe('streaks', () => {
  it('handles an empty list', () => {
    expect(streaks([])).toEqual({ current: 0, longest: 0 })
  })
})

describe('series', () => {
  const run = v('v1', runDef, '2026-01-01', null)
  it('sums miles per week with empty buckets as null', () => {
    const s = valueSeries([done(run, '2026-10-05', 1), done(run, '2026-10-06', 2), done(run, '2026-10-14', 5)], { from: '2026-10-01', to: '2026-10-15', bucket: 'week', weekStartsOn: 1, fieldKey: 'miles', agg: 'sum' })
    expect(s.map((p) => [p.key, p.value])).toEqual([['2026-09-28', null], ['2026-10-05', 3], ['2026-10-12', 5]])
  })
  it('counts completions per month with zeros', () => {
    const s = valueSeries([done(run, '2026-10-05')], { from: '2026-09-01', to: '2026-10-15', bucket: 'month', weekStartsOn: 1, agg: 'count' })
    expect(s.map((p) => p.value)).toEqual([0, 1])
  })
  it('completion rate per month', () => {
    const { segments } = computeStats({ ...base, from: '2026-10-01', versions: [run], completions: ['01', '02', '03', '04', '05'].map((d) => done(run, `2026-10-${d}`)) })
    const r = rateSeries(segments, '2026-10-01', '2026-10-15')
    expect(r).toHaveLength(1)
    expect(r[0]!.value).toBeCloseTo(5 / 14)
  })
})
