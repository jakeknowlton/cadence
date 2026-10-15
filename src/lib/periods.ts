import { addDays, addMonths, format, getDay, parseISO, startOfMonth } from 'date-fns'
import type { Cadence, Weekday } from '@/types/task'

/** A calendar date as 'YYYY-MM-DD'. All period maths works on these, never on instants. */
export type DateString = string

export type PeriodKey = `d:${string}` | `w:${string}` | `m:${string}`

export interface Period {
  cadence: Cadence
  key: PeriodKey
  /** first day, inclusive */
  start: DateString
  /** last day, inclusive */
  end: DateString
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const PERIOD_KEY_RE = /^(d|w|m):\d{4}-\d{2}-\d{2}$/

function toDate(d: DateString): Date {
  if (!DATE_RE.test(d)) throw new Error(`Invalid date string: ${d}`)
  return parseISO(d)
}

function fromDate(d: Date): DateString {
  return format(d, 'yyyy-MM-dd')
}

export function shiftDays(d: DateString, days: number): DateString {
  return fromDate(addDays(toDate(d), days))
}

/** The calendar date of an instant in the given IANA timezone. */
export function localDate(instant: Date, timeZone: string): DateString {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

export function weekdayOf(d: DateString): Weekday {
  return getDay(toDate(d)) as Weekday
}

/** First day of the week containing `d`, for a week starting on `weekStartsOn`. */
export function startOfWeekFor(d: DateString, weekStartsOn: Weekday): DateString {
  const diff = (weekdayOf(d) - weekStartsOn + 7) % 7
  return shiftDays(d, -diff)
}

export function periodFor(d: DateString, cadence: Cadence, weekStartsOn: Weekday): Period {
  switch (cadence) {
    case 'daily':
      return { cadence, key: `d:${d}`, start: d, end: d }
    case 'weekly': {
      const start = startOfWeekFor(d, weekStartsOn)
      return { cadence, key: `w:${start}`, start, end: shiftDays(start, 6) }
    }
    case 'monthly': {
      const startDate = startOfMonth(toDate(d))
      const start = fromDate(startDate)
      const end = fromDate(addDays(addMonths(startDate, 1), -1))
      return { cadence, key: `m:${start}`, start, end }
    }
  }
}

export function periodKey(d: DateString, cadence: Cadence, weekStartsOn: Weekday): PeriodKey {
  return periodFor(d, cadence, weekStartsOn).key
}

/** Rebuild a Period from its key. Weekly keys carry their own start date, so no week-start setting is needed. */
export function parsePeriodKey(key: string): Period {
  if (!PERIOD_KEY_RE.test(key)) throw new Error(`Invalid period key: ${key}`)
  const prefix = key[0]
  const start = key.slice(2)
  switch (prefix) {
    case 'd':
      return { cadence: 'daily', key: key as PeriodKey, start, end: start }
    case 'w':
      return { cadence: 'weekly', key: key as PeriodKey, start, end: shiftDays(start, 6) }
    default: {
      const end = fromDate(addDays(addMonths(toDate(start), 1), -1))
      return { cadence: 'monthly', key: key as PeriodKey, start, end }
    }
  }
}

/** The period after the one containing `d`. */
export function nextPeriod(d: DateString, cadence: Cadence, weekStartsOn: Weekday): Period {
  const current = periodFor(d, cadence, weekStartsOn)
  return periodFor(shiftDays(current.end, 1), cadence, weekStartsOn)
}

/** The current day, week, and month keys for a given date. */
export function currentPeriodKeys(
  d: DateString,
  weekStartsOn: Weekday,
): Record<Cadence, PeriodKey> {
  return {
    daily: periodKey(d, 'daily', weekStartsOn),
    weekly: periodKey(d, 'weekly', weekStartsOn),
    monthly: periodKey(d, 'monthly', weekStartsOn),
  }
}

/** Whether a daily task applies on this date. `null` means every day. */
export function isActiveDay(d: DateString, activeDays: Weekday[] | null): boolean {
  return activeDays === null || activeDays.includes(weekdayOf(d))
}

/**
 * A member may write to a period if it has not yet started closing beyond the edit window:
 * the period's last day is within `editWindowDays` days before `today`, and the period
 * has started (no logging into the future).
 */
export function isWithinEditWindow(
  period: Period,
  today: DateString,
  editWindowDays: number,
): boolean {
  const earliestAllowedEnd = shiftDays(today, -editWindowDays)
  return period.end >= earliestAllowedEnd && period.start <= today
}

/** Does the version's [effectiveFrom, effectiveTo] range overlap the period? */
export function versionCoversPeriod(
  version: { effectiveFrom: DateString; effectiveTo: DateString | null },
  period: Period,
): boolean {
  return (
    version.effectiveFrom <= period.end &&
    (version.effectiveTo === null || version.effectiveTo >= period.start)
  )
}

/** All periods of a cadence that overlap [from, to], in order. */
export function periodsInRange(
  from: DateString,
  to: DateString,
  cadence: Cadence,
  weekStartsOn: Weekday,
): Period[] {
  const out: Period[] = []
  let p = periodFor(from, cadence, weekStartsOn)
  while (p.start <= to) {
    out.push(p)
    p = periodFor(shiftDays(p.end, 1), cadence, weekStartsOn)
  }
  return out
}
