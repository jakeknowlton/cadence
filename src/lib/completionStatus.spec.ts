import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskSnapshot } from '@/types/group'
import type { Completion } from '@/types/completion'
import { entryMisses, formatValue, missingRequiredFields, parseDuration, periodStatus, periodTotals, qualifies, quickValues, roundToStep, totalProgress } from './completionStatus'

const snap = (fields: TaskSnapshot['fields'], requiredCount = 1, cadence: TaskSnapshot['cadence'] = 'daily'): TaskSnapshot =>
  ({ cadence, activeDays: null, requiredCount, completionType: 'fields', fields })

// The spec's examples.
const track = snap([{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: true }])
const under = snap([{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: false, totalMax: 2200 }])
const squats = snap([{ key: 'squats', label: 'Squats', type: 'number', required: true, totalMin: 100, default: 100 }])
const fastMile = snap([
  { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, min: 1, default: 1 },
  { key: 'time', label: 'Time', type: 'duration', required: true, max: 600 },
])
const sets = snap([{ key: 'reps', label: 'Reps', type: 'number', required: true, min: 12, default: 12 }], 3)
const weekly = snap([{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, totalMin: 10 }], 3, 'weekly')
const stretch = snap([{ key: 'notes', label: 'Notes', type: 'text', required: false }])
const lift: TaskSnapshot = { cadence: 'weekly', activeDays: null, requiredCount: 3, completionType: 'checkbox', fields: [] }

function c(snapshot: TaskSnapshot, values: Completion['values'], at = 0): Completion {
  return { id: `x${at}${Math.random()}`, userId: 'u', groupId: 'g', taskId: 't', taskVersionId: 'v', taskName: 'T', cadence: snapshot.cadence, periodKey: 'd:2026-10-15', weekStartsOn: 1,
    completedAt: Timestamp.fromMillis(at), loggedAt: Timestamp.fromMillis(at), values, note: null, taskSnapshot: snapshot, deletedAt: null }
}
const day = (s: TaskSnapshot, ...values: Completion['values'][]) => periodStatus(s, values.map((v, i) => c(s, v, i)))

describe('qualifies', () => {
  it('with no per-entry limits every entry qualifies, even a blank one', () => {
    expect(qualifies(track, { kcal: 4000 })).toBe(true)
    expect(qualifies(stretch, {})).toBe(true)
  })
  it('one entry must meet every per-entry limit at once', () => {
    expect(qualifies(fastMile, { miles: 1, time: 570 })).toBe(true)
    expect(qualifies(fastMile, { miles: 1, time: 720 })).toBe(false)
    expect(qualifies(fastMile, { miles: 0.5, time: 240 })).toBe(false)
  })
  it('a blank value misses a limit on its field', () => {
    expect(entryMisses(fastMile, { miles: 1 })).toEqual([{ key: 'time', side: 'max', limit: 600, blank: true }])
  })
})

describe('periodStatus', () => {
  it('visibility only: any entry completes the day', () => {
    expect(day(track, { kcal: 4000 }).complete).toBe(true)
    expect(day(track).complete).toBe(false)
  })
  it('a total max adds up meals; an empty entry completes it', () => {
    expect(day(under, { kcal: 600 }, { kcal: 900 }).complete).toBe(true)
    expect(day(under, { kcal: 1200 }, { kcal: 1200 }).complete).toBe(false)
    expect(day(under, {}).complete).toBe(true)
  })
  it('a total min adds up spread-out entries', () => {
    expect(day(squats, { squats: 40 })).toMatchObject({ complete: false, totals: [{ key: 'squats', sum: 40, min: 100, ok: false }] })
    expect(day(squats, { squats: 40 }, { squats: 60 }).complete).toBe(true)
  })
  it('a slow mile plus a fast half mile does not make a fast mile', () => {
    expect(day(fastMile, { miles: 1, time: 720 }, { miles: 0.5, time: 240 }).complete).toBe(false)
    expect(day(fastMile, { miles: 1, time: 720 }, { miles: 1, time: 570 }).complete).toBe(true)
  })
  it('sets: enough qualifying entries, extra short ones are fine', () => {
    expect(day(sets, { reps: 12 }, { reps: 13 }, { reps: 14 }, { reps: 15 }, { reps: 16 })).toMatchObject({ count: 5, complete: true })
    expect(day(sets, { reps: 12 }, { reps: 12 }, { reps: 10 })).toMatchObject({ count: 2, total: 3, complete: false })
    expect(day(sets, { reps: 12 }, { reps: 12 }, { reps: 12 }, { reps: 8 }).complete).toBe(true)
  })
  it('a count and a total together', () => {
    expect(day(weekly, { miles: 4 }, { miles: 4 }, { miles: 2 }).complete).toBe(true)
    expect(day(weekly, { miles: 6 }, { miles: 5 }).complete).toBe(false)
    expect(day(weekly, { miles: 3 }, { miles: 3 }, { miles: 3 }).complete).toBe(false)
  })
  it('counts toward times per period and ignores deleted entries', () => {
    const s = periodStatus(lift, [c(lift, {}), c(lift, {}), { ...c(lift, {}), deletedAt: Timestamp.now() }])
    expect(s).toMatchObject({ count: 2, total: 2, required: 3, complete: false })
  })
})

describe('periodTotals and totalProgress', () => {
  it('sums every entry and reads as progress', () => {
    const [t] = periodTotals(squats, [{ squats: 40 }, { squats: null }])
    expect(totalProgress(t!, squats.fields[0]!)).toBe('40 / 100')
    const [m] = periodTotals(under, [{ kcal: 1850 }])
    expect(totalProgress(m!, under.fields[0]!)).toBe('1850 kcal of 2200 kcal max')
  })
})

describe('quickValues', () => {
  it('fills every default when every required field has one', () => {
    expect(quickValues(squats)).toEqual({ squats: 100 })
    expect(quickValues(under)).toEqual({ kcal: null })
    expect(quickValues(stretch)).toEqual({ notes: null })
  })
  it('needs the form when a required field has no default', () => {
    expect(quickValues(track)).toBeNull()
    expect(quickValues(fastMile)).toBeNull()
    expect(missingRequiredFields(track, {})).toEqual(['kcal'])
  })
  it('a one-tap entry qualifies', () => {
    for (const s of [squats, sets, under, stretch]) expect(qualifies(s, quickValues(s)!)).toBe(true)
  })
})

describe('parseDuration', () => {
  it('reads seconds, m:ss, and h:mm:ss; rejects anything else', () => {
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('12:30')).toBe(750)
    expect(parseDuration('1:02:05')).toBe(3725)
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('1:2:3:4')).toBeNull()
    expect(parseDuration('ten')).toBeNull()
  })
})

describe('roundToStep', () => {
  it('rounds to the nearest step without float noise, and leaves values alone without one', () => {
    expect(roundToStep(1.24, 0.1)).toBe(1.2)
    expect(roundToStep(0.25, 0.1)).toBe(0.3)
    expect(roundToStep(2.3, 0.25)).toBe(2.25)
    expect(roundToStep(2212, 5)).toBe(2210)
    expect(roundToStep(1.234, undefined)).toBe(1.234)
  })
})

describe('formatValue', () => {
  it('formats durations, units, and booleans', () => {
    expect(formatValue(754, 'duration')).toBe('12:34')
    expect(formatValue(3725, 'duration')).toBe('1:02:05')
    expect(formatValue(1.5, 'number', 'mi')).toBe('1.5 mi')
    expect(formatValue(true, 'boolean')).toBe('Yes')
    expect(formatValue(null, 'number')).toBe('')
  })
})
