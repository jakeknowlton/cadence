import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskSnapshot } from '@/types/group'
import type { Completion } from '@/types/completion'
import { formatValue, isCounting, roundToStep, missingRequiredFields, periodStatus, quickValues, targetMet } from './completionStatus'

const calories: TaskSnapshot = {
  cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: true }],
  target: { fieldKey: 'kcal', comparator: '<=', value: 2200 },
}
const caloriesNoGoal: TaskSnapshot = { ...calories, target: null }
const run: TaskSnapshot = {
  cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [
    { key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: true, default: 1 },
    { key: 'time', label: 'Time', type: 'duration', required: false },
  ],
  target: { fieldKey: 'miles', comparator: '>=', value: 1 },
}
const lift: TaskSnapshot = { cadence: 'weekly', activeDays: null, requiredCount: 3, completionType: 'checkbox', fields: [], target: null }

function c(snapshot: TaskSnapshot, values: Completion['values'], at = 0): Completion {
  return { id: 'x', userId: 'u', groupId: 'g', taskId: 't', taskVersionId: 'v', taskName: 'T', cadence: snapshot.cadence, periodKey: 'd:2026-10-15', weekStartsOn: 1,
    completedAt: Timestamp.fromMillis(at), loggedAt: Timestamp.fromMillis(at), values, note: null, taskSnapshot: snapshot, deletedAt: null }
}

describe('targetMet', () => {
  it('evaluates comparators and returns null without a usable value', () => {
    expect(targetMet(calories, { kcal: 2000 })).toBe(true)
    expect(targetMet(calories, { kcal: 2400 })).toBe(false)
    expect(targetMet(calories, {})).toBeNull()
    expect(targetMet(lift, {})).toBeNull()
    expect(targetMet({ ...run, target: { fieldKey: 'miles', comparator: 'between', value: 1, valueMax: 3 } }, { miles: 2 })).toBe(true)
    expect(targetMet({ ...run, target: { fieldKey: 'miles', comparator: 'between', value: 1, valueMax: 3 } }, { miles: 4 })).toBe(false)
  })
})

describe('isCounting', () => {
  it('a goal must be met', () => {
    expect(isCounting(calories, { kcal: 2000 })).toBe(true)
    expect(isCounting(calories, { kcal: 2400 })).toBe(false)
    expect(isCounting(run, { miles: 1.5 })).toBe(true)
    expect(isCounting(run, { miles: 0.5 })).toBe(false)
  })
  it('without a goal any value in the required fields counts', () => {
    expect(isCounting(caloriesNoGoal, { kcal: 4000 })).toBe(true)
    expect(missingRequiredFields(calories, {})).toEqual(['kcal'])
    expect(isCounting(caloriesNoGoal, { kcal: null })).toBe(false)
  })
})

describe('periodStatus', () => {
  it('counts toward requiredCount and ignores soft-deleted completions', () => {
    const s = periodStatus(lift, [c(lift, {}), c(lift, {}), { ...c(lift, {}), deletedAt: Timestamp.now() }])
    expect(s).toMatchObject({ count: 2, total: 2, required: 3, complete: false })
  })
  it('a short run is logged but does not complete the day', () => {
    expect(periodStatus(run, [c(run, { miles: 0.5 })])).toMatchObject({ count: 0, total: 1, complete: false })
    expect(periodStatus(run, [c(run, { miles: 0.5 }, 1), c(run, { miles: 1.5 }, 2)])).toMatchObject({ count: 1, total: 2, complete: true })
  })
  it('a logged-but-not-counting calories day is not complete', () => {
    expect(periodStatus(calories, [c(calories, { kcal: 2500 })])).toMatchObject({ count: 0, total: 1, complete: false })
  })
})

describe('quickValues', () => {
  it('fills defaults when every required field has one, and the result counts', () => {
    const v = quickValues(run)
    expect(v).toEqual({ miles: 1, time: null })
    expect(isCounting(run, v!)).toBe(true)
  })
  it('needs the sheet when a required field has no default or nothing has a default', () => {
    expect(quickValues(calories)).toBeNull()
    expect(quickValues({ ...run, fields: [{ key: 'time', label: 'Time', type: 'duration', required: false }] })).toBeNull()
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
