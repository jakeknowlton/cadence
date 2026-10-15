import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TaskDefinition } from '@/types/task'
import type { TaskVersionDoc } from '@/types/group'
import { effectiveFromForChange, lineageFieldTypes, newTaskVersion, nextTaskVersion, snapshotOf, versionInEffect, versionsInEffect, latestVersions } from './versions'

const def: TaskDefinition = {
  name: 'Run', sortOrder: 1, cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
  fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: false, min: 0 }],
  target: { fieldKey: 'miles', comparator: '>=', value: 1, gatesCompletion: false },
}

function asDoc(w: ReturnType<typeof newTaskVersion>, id: string): TaskVersionDoc {
  return { ...w, id, createdAt: Timestamp.now() } as TaskVersionDoc
}

describe('newTaskVersion', () => {
  it('builds version 1 with keys, types, and a snapshot without undefined values', () => {
    const v = newTaskVersion(def, { taskId: 't1', effectiveFrom: '2026-10-15', createdBy: 'u' })
    expect(v.version).toBe(1)
    expect(v.prevVersionId).toBeNull()
    expect(v.fieldKeys).toEqual(['miles'])
    expect(v.fieldTypes).toEqual({ miles: 'number|mi' })
    expect(v.snapshot).toEqual({
      cadence: 'daily', activeDays: null, requiredCount: 1, completionType: 'fields',
      fields: [{ key: 'miles', label: 'Distance', type: 'number', unit: 'mi', required: false, min: 0 }],
      target: { fieldKey: 'miles', comparator: '>=', value: 1, gatesCompletion: false },
    })
    expect(JSON.stringify(v)).not.toContain('undefined')
  })

  it('snapshot uses null for a missing target and drops activeDays off non-daily tasks', () => {
    const s = snapshotOf({ ...def, cadence: 'weekly', activeDays: [1], target: undefined })
    expect(s.target).toBeNull()
    expect(s.activeDays).toBeNull()
  })
})

describe('nextTaskVersion', () => {
  it('increments, links to prev, carries lineage field types, and closes prev the day before', () => {
    const v1 = asDoc(newTaskVersion(def, { taskId: 't1', effectiveFrom: '2026-01-01', createdBy: 'u' }), 'v1')
    const changed = { ...def, fields: [{ key: 'time', label: 'Time', type: 'duration' as const, required: false }], target: undefined }
    const { version, closePrev } = nextTaskVersion(v1, changed, { effectiveFrom: '2026-10-16', createdBy: 'u', lineage: lineageFieldTypes([v1], 't1') })
    expect(version.version).toBe(2)
    expect(version.prevVersionId).toBe('v1')
    expect(version.fieldKeys).toEqual(['time'])
    expect(version.fieldTypes).toEqual({ miles: 'number|mi', time: 'duration|' })
    expect(closePrev).toEqual({ effectiveTo: '2026-10-15' })
  })
})

describe('effectiveFromForChange', () => {
  it('same cadence: next period', () => {
    expect(effectiveFromForChange('2026-10-15', 'daily', 'daily', 1)).toBe('2026-10-16')
    expect(effectiveFromForChange('2026-10-15', 'weekly', 'weekly', 1)).toBe('2026-10-19')
  })
  it('cadence change: the later of the two next-period starts', () => {
    expect(effectiveFromForChange('2026-10-15', 'daily', 'weekly', 1)).toBe('2026-10-19')
    expect(effectiveFromForChange('2026-10-15', 'weekly', 'daily', 1)).toBe('2026-10-19')
    expect(effectiveFromForChange('2026-10-15', 'daily', 'monthly', 1)).toBe('2026-11-01')
  })
})

describe('versionsInEffect', () => {
  const v1 = asDoc(newTaskVersion(def, { taskId: 't1', effectiveFrom: '2026-01-01', createdBy: 'u' }), 'v1')
  v1.effectiveTo = '2026-10-15'
  const v2 = asDoc({ ...newTaskVersion({ ...def, cadence: 'weekly' }, { taskId: 't1', effectiveFrom: '2026-10-16', createdBy: 'u' }), version: 2, prevVersionId: 'v1' }, 'v2')
  const other = asDoc(newTaskVersion({ ...def, name: 'Other', sortOrder: 0 }, { taskId: 't2', effectiveFrom: '2026-06-01', createdBy: 'u' }), 'o1')
  other.effectiveTo = '2026-09-30'

  it('picks the version covering the date, one per task, sorted', () => {
    expect(versionsInEffect([v1, v2, other], '2026-09-01').map((v) => v.id)).toEqual(['o1', 'v1'])
    expect(versionsInEffect([v1, v2, other], '2026-10-15').map((v) => v.id)).toEqual(['v1'])
    expect(versionsInEffect([v1, v2, other], '2026-10-16').map((v) => v.id)).toEqual(['v2'])
    expect(versionInEffect([v1, v2], 't1', '2026-10-16')?.id).toBe('v2')
    expect(versionInEffect([v1, v2], 't1', '2025-12-31')).toBeNull()
  })
  it('latestVersions includes retired tasks', () => {
    expect(latestVersions([v1, v2, other]).map((v) => v.id)).toEqual(['o1', 'v2'])
  })
})
