import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskSnapshot } from '@/types/group'
import type { Completion } from '@/types/completion'
import { formatValue, isCounting, roundToStep, missingRequiredFields, outOfRangeFields, parseDuration, periodStatus, quickValues } from './completionStatus'

const snap = (fields: TaskSnapshot['fields'], requiredCount = 1): TaskSnapshot =>
  ({ cadence: 'daily', activeDays: null, requiredCount, completionType: 'fields', fields })

// The spec's examples.
const track = snap([{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: true }])
const under = snap([{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: false, max: 2200 }])
const run = snap([
  { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, min: 1, default: 1 },
  { key: 'time', label: 'Time', type: 'duration', required: false },
])
const fast = snap([
  { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, min: 1, default: 1 },
  { key: 'time', label: 'Time', type: 'duration', required: true, max: 600 },
])
const stretch = snap([{ key: 'notes', label: 'Notes', type: 'text', required: false }])
const lift: TaskSnapshot = { cadence: 'weekly', activeDays: null, requiredCount: 3, completionType: 'checkbox', fields: [] }

function c(snapshot: TaskSnapshot, values: Completion['values'], at = 0): Completion {
  return { id: 'x', userId: 'u', groupId: 'g', taskId: 't', taskVersionId: 'v', taskName: 'T', cadence: snapshot.cadence, periodKey: 'd:2026-10-15', weekStartsOn: 1,
    completedAt: Timestamp.fromMillis(at), loggedAt: Timestamp.fromMillis(at), values, note: null, taskSnapshot: snapshot, deletedAt: null }
}

describe('isCounting', () => {
  it('visibility only: any value in a required field counts, blank does not', () => {
    expect(isCounting(track, { kcal: 4000 })).toBe(true)
    expect(isCounting(track, { kcal: null })).toBe(false)
    expect(missingRequiredFields(track, {})).toEqual(['kcal'])
  })
  it('an optional field with a max: blank counts, inside counts, outside does not', () => {
    expect(isCounting(under, {})).toBe(true)
    expect(isCounting(under, { kcal: 1850 })).toBe(true)
    expect(isCounting(under, { kcal: 2200 })).toBe(true)
    expect(isCounting(under, { kcal: 2400 })).toBe(false)
  })
  it('a min, and every field must be in range', () => {
    expect(isCounting(run, { miles: 1.5 })).toBe(true)
    expect(isCounting(run, { miles: 0.5 })).toBe(false)
    expect(isCounting(fast, { miles: 1, time: 540 })).toBe(true)
    expect(isCounting(fast, { miles: 1, time: 660 })).toBe(false)
    expect(isCounting(fast, { miles: 1 })).toBe(false)
  })
  it('min equal to max means exactly', () => {
    const exact = snap([{ key: 'reps', label: 'Reps', type: 'number', required: true, min: 10, max: 10 }])
    expect(isCounting(exact, { reps: 10 })).toBe(true)
    expect(isCounting(exact, { reps: 11 })).toBe(false)
  })
  it('zero is a value, and a yes/no answered No is a value', () => {
    expect(isCounting(track, { kcal: 0 })).toBe(true)
    const took = snap([{ key: 'took', label: 'Took vitamins', type: 'boolean', required: true }])
    expect(isCounting(took, { took: false })).toBe(true)
    expect(isCounting(took, { took: null })).toBe(false)
  })
})

describe('outOfRangeFields', () => {
  it('names the field and the limit it crossed', () => {
    expect(outOfRangeFields(fast, { miles: 0.5, time: 660 })).toEqual([
      { key: 'miles', side: 'min', limit: 1 },
      { key: 'time', side: 'max', limit: 600 },
    ])
    expect(outOfRangeFields(under, {})).toEqual([])
  })
})

describe('periodStatus', () => {
  it('counts toward requiredCount and ignores soft-deleted completions', () => {
    const s = periodStatus(lift, [c(lift, {}), c(lift, {}), { ...c(lift, {}), deletedAt: Timestamp.now() }])
    expect(s).toMatchObject({ count: 2, total: 2, required: 3, complete: false })
  })
  it('an out-of-range entry is logged but does not complete the day', () => {
    expect(periodStatus(run, [c(run, { miles: 0.5 })])).toMatchObject({ count: 0, total: 1, complete: false })
    expect(periodStatus(run, [c(run, { miles: 0.5 }, 1), c(run, { miles: 1.5 }, 2)])).toMatchObject({ count: 1, total: 2, complete: true })
  })
})

describe('quickValues', () => {
  it('fills every default when every required field has one', () => {
    expect(quickValues(run)).toEqual({ miles: 1, time: null })
    expect(quickValues(under)).toEqual({ kcal: null })
    expect(quickValues(stretch)).toEqual({ notes: null })
  })
  it('needs the form when a required field has no default', () => {
    expect(quickValues(track)).toBeNull()
    expect(quickValues(fast)).toBeNull()
  })
  it('one-tap values count for every one-tap example', () => {
    for (const s of [run, under, stretch]) expect(isCounting(s, quickValues(s)!)).toBe(true)
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
