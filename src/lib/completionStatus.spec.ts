import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskSnapshot } from '@/types/group'
import type { Completion } from '@/types/completion'
import { formatValue, isCounting, missingRequiredFields, periodStatus, targetMet } from './completionStatus'

const calories: TaskSnapshot = {
  cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [{ key: 'kcal', label: 'Calories', type: 'number', unit: 'kcal', required: true }],
  target: { fieldKey: 'kcal', comparator: '<=', value: 2200, gatesCompletion: true },
}
const run: TaskSnapshot = {
  cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: false }],
  target: { fieldKey: 'miles', comparator: '>=', value: 1, gatesCompletion: false },
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
    expect(targetMet({ ...run, target: { fieldKey: 'miles', comparator: 'between', value: 1, valueMax: 3, gatesCompletion: false } }, { miles: 2 })).toBe(true)
    expect(targetMet({ ...run, target: { fieldKey: 'miles', comparator: 'between', value: 1, valueMax: 3, gatesCompletion: false } }, { miles: 4 })).toBe(false)
  })
})

describe('isCounting', () => {
  it('gating target must be met', () => {
    expect(isCounting(calories, { kcal: 2000 })).toBe(true)
    expect(isCounting(calories, { kcal: 2400 })).toBe(false)
  })
  it('badge target does not gate; required fields do', () => {
    expect(isCounting(run, {})).toBe(true)
    expect(isCounting(run, { miles: 0.5 })).toBe(true)
    expect(missingRequiredFields(calories, {})).toEqual(['kcal'])
    expect(isCounting(calories, { kcal: null })).toBe(false)
  })
})

describe('periodStatus', () => {
  it('counts toward requiredCount and ignores soft-deleted completions', () => {
    const s = periodStatus(lift, [c(lift, {}), c(lift, {}), { ...c(lift, {}), deletedAt: Timestamp.now() }])
    expect(s).toMatchObject({ count: 2, total: 2, required: 3, complete: false })
  })
  it('reports the latest completion goal badge', () => {
    const s = periodStatus(run, [c(run, { miles: 0.5 }, 1), c(run, { miles: 1.5 }, 2)])
    expect(s).toMatchObject({ complete: true, goalMet: true })
    expect(periodStatus(run, [c(run, { miles: 1.5 }, 1), c(run, { miles: 0.5 }, 2)]).goalMet).toBe(false)
  })
  it('a logged-but-not-counting calories day is not complete', () => {
    expect(periodStatus(calories, [c(calories, { kcal: 2500 })])).toMatchObject({ count: 0, total: 1, complete: false, goalMet: false })
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
