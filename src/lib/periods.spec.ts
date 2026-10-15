import { describe, expect, it } from 'vitest'
import {
  currentPeriodKeys,
  isActiveDay,
  isWithinEditWindow,
  localDate,
  nextPeriod,
  parsePeriodKey,
  periodFor,
  periodsInRange,
  startOfWeekFor,
  versionCoversPeriod,
} from './periods'

describe('periodFor', () => {
  it('daily key is the date itself', () => {
    expect(periodFor('2026-10-15', 'daily', 1)).toEqual({
      cadence: 'daily', key: 'd:2026-10-15', start: '2026-10-15', end: '2026-10-15',
    })
  })

  it('weekly with Monday start: Thursday 2026-10-15 belongs to week of Mon 2026-10-12', () => {
    expect(periodFor('2026-10-15', 'weekly', 1)).toEqual({
      cadence: 'weekly', key: 'w:2026-10-12', start: '2026-10-12', end: '2026-10-18',
    })
  })

  it('weekly with Sunday start: Thursday 2026-10-15 belongs to week of Sun 2026-10-11', () => {
    expect(periodFor('2026-10-15', 'weekly', 0).key).toBe('w:2026-10-11')
  })

  it('weekly: the start day itself starts a new week', () => {
    expect(periodFor('2026-10-12', 'weekly', 1).key).toBe('w:2026-10-12')
    expect(periodFor('2026-10-11', 'weekly', 1).key).toBe('w:2026-10-05')
  })

  it('weekly crosses a year boundary cleanly', () => {
    expect(periodFor('2027-01-01', 'weekly', 1)).toMatchObject({ start: '2026-12-28', end: '2027-01-03' })
  })

  it('monthly key is the first of the month and end is the last day', () => {
    expect(periodFor('2026-02-10', 'monthly', 1)).toEqual({
      cadence: 'monthly', key: 'm:2026-02-01', start: '2026-02-01', end: '2026-02-28',
    })
    expect(periodFor('2028-02-10', 'monthly', 1).end).toBe('2028-02-29')
  })
})

describe('startOfWeekFor', () => {
  it('handles every weekday for both start days', () => {
    // 2026-10-11 is a Sunday
    const days = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']
    for (const d of days) expect(startOfWeekFor(d, 0)).toBe('2026-10-11')
    expect(startOfWeekFor('2026-10-11', 1)).toBe('2026-10-05')
    for (const d of days.slice(1)) expect(startOfWeekFor(d, 1)).toBe('2026-10-12')
  })
})

describe('parsePeriodKey', () => {
  it('round-trips every cadence', () => {
    for (const d of ['2026-10-15', '2026-12-31', '2027-01-01']) {
      for (const c of ['daily', 'weekly', 'monthly'] as const) {
        const p = periodFor(d, c, 1)
        expect(parsePeriodKey(p.key)).toEqual(p)
      }
    }
  })
  it('rejects malformed keys', () => {
    expect(() => parsePeriodKey('2026-10-15')).toThrow(/Invalid period key/)
    expect(() => parsePeriodKey('x:2026-10-15')).toThrow(/Invalid period key/)
  })
})

describe('nextPeriod', () => {
  it('advances by cadence', () => {
    expect(nextPeriod('2026-10-15', 'daily', 1).key).toBe('d:2026-10-16')
    expect(nextPeriod('2026-10-15', 'weekly', 1).key).toBe('w:2026-10-19')
    expect(nextPeriod('2026-10-15', 'monthly', 1).key).toBe('m:2026-11-01')
    expect(nextPeriod('2026-12-15', 'monthly', 1).key).toBe('m:2027-01-01')
  })
})

describe('currentPeriodKeys', () => {
  it('returns all three', () => {
    expect(currentPeriodKeys('2026-10-15', 1)).toEqual({
      daily: 'd:2026-10-15', weekly: 'w:2026-10-12', monthly: 'm:2026-10-01',
    })
  })
})

describe('localDate', () => {
  it('rolls the date in the given timezone', () => {
    const instant = new Date('2026-10-16T03:30:00Z') // 21:30 Oct 15 in Denver, 05:30 Oct 16 in Paris
    expect(localDate(instant, 'America/Denver')).toBe('2026-10-15')
    expect(localDate(instant, 'Europe/Paris')).toBe('2026-10-16')
    expect(localDate(instant, 'UTC')).toBe('2026-10-16')
  })
})

describe('isActiveDay', () => {
  it('null means every day', () => {
    expect(isActiveDay('2026-10-17', null)).toBe(true) // Saturday
  })
  it('weekdays only excludes Saturday', () => {
    expect(isActiveDay('2026-10-17', [1, 2, 3, 4, 5])).toBe(false)
    expect(isActiveDay('2026-10-16', [1, 2, 3, 4, 5])).toBe(true)
  })
})

describe('isWithinEditWindow', () => {
  const today = '2026-10-15'
  it('current period is always editable', () => {
    expect(isWithinEditWindow(periodFor(today, 'daily', 1), today, 2)).toBe(true)
    expect(isWithinEditWindow(periodFor(today, 'weekly', 1), today, 2)).toBe(true)
    expect(isWithinEditWindow(periodFor(today, 'monthly', 1), today, 2)).toBe(true)
  })
  it('yesterday and the day before are editable with a 2-day window, three days ago is not', () => {
    expect(isWithinEditWindow(periodFor('2026-10-14', 'daily', 1), today, 2)).toBe(true)
    expect(isWithinEditWindow(periodFor('2026-10-13', 'daily', 1), today, 2)).toBe(true)
    expect(isWithinEditWindow(periodFor('2026-10-12', 'daily', 1), today, 2)).toBe(false)
  })
  it('last week is editable only if it ended within the window', () => {
    // Monday start: last week ended Sun 2026-10-11, 4 days before today
    expect(isWithinEditWindow(periodFor('2026-10-08', 'weekly', 1), today, 2)).toBe(false)
    expect(isWithinEditWindow(periodFor('2026-10-08', 'weekly', 1), '2026-10-13', 2)).toBe(true)
  })
  it('future periods are not editable', () => {
    expect(isWithinEditWindow(periodFor('2026-10-16', 'daily', 1), today, 2)).toBe(false)
  })
  it('a zero-day window allows only periods still open today', () => {
    expect(isWithinEditWindow(periodFor('2026-10-14', 'daily', 1), today, 0)).toBe(false)
    expect(isWithinEditWindow(periodFor(today, 'weekly', 1), today, 0)).toBe(true)
  })
})

describe('versionCoversPeriod', () => {
  const week = periodFor('2026-10-15', 'weekly', 1) // Oct 12–18
  it('open-ended version starting before the period', () => {
    expect(versionCoversPeriod({ effectiveFrom: '2026-01-01', effectiveTo: null }, week)).toBe(true)
  })
  it('version starting mid-period still covers it', () => {
    expect(versionCoversPeriod({ effectiveFrom: '2026-10-15', effectiveTo: null }, week)).toBe(true)
  })
  it('version that ended before the period does not', () => {
    expect(versionCoversPeriod({ effectiveFrom: '2026-01-01', effectiveTo: '2026-10-11' }, week)).toBe(false)
  })
  it('version starting after the period does not', () => {
    expect(versionCoversPeriod({ effectiveFrom: '2026-10-19', effectiveTo: null }, week)).toBe(false)
  })
})

describe('periodsInRange', () => {
  it('lists weeks overlapping a range', () => {
    expect(periodsInRange('2026-10-01', '2026-10-15', 'weekly', 1).map((p) => p.key)).toEqual([
      'w:2026-09-28', 'w:2026-10-05', 'w:2026-10-12',
    ])
  })
  it('lists months', () => {
    expect(periodsInRange('2026-11-15', '2027-01-02', 'monthly', 1).map((p) => p.key)).toEqual([
      'm:2026-11-01', 'm:2026-12-01', 'm:2027-01-01',
    ])
  })
})
