import type { TaskDefinition, TaskField, Weekday } from '@/types/task'
import type { TaskSnapshot, TaskVersionDoc } from '@/types/group'
import { fieldSignature } from './taskEdits'
import { nextPeriod, shiftDays, type DateString } from './periods'

/** Remove undefined values so the object round-trips through Firestore unchanged. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v)
    }
    return out as T
  }
  return value
}

export function snapshotOf(def: TaskDefinition): TaskSnapshot {
  return clean({
    cadence: def.cadence,
    activeDays: def.cadence === 'daily' ? def.activeDays : null,
    requiredCount: def.requiredCount,
    completionType: def.completionType,
    fields: def.fields,
    target: def.target ?? null,
  })
}

export function fieldTypesOf(fields: TaskField[], inherited: Record<string, string> = {}): Record<string, string> {
  const out = { ...inherited }
  for (const f of fields) out[f.key] = fieldSignature(f)
  return out
}

/** Union of fieldTypes over every version of a task: the lineage's locked signatures. */
export function lineageFieldTypes(versions: TaskVersionDoc[], taskId: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of versions) if (v.taskId === taskId) Object.assign(out, v.fieldTypes)
  return out
}

/**
 * The first day a measured change takes effect: the start of the next period under both the old
 * and the new cadence, whichever is later, so neither cadence gets a partial period.
 */
export function effectiveFromForChange(
  today: DateString,
  oldCadence: TaskDefinition['cadence'],
  newCadence: TaskDefinition['cadence'],
  weekStartsOn: Weekday,
): DateString {
  const a = nextPeriod(today, oldCadence, weekStartsOn).start
  const b = nextPeriod(today, newCadence, weekStartsOn).start
  return a > b ? a : b
}

export type VersionWrite = Omit<TaskVersionDoc, 'id' | 'createdAt'>

/** Build the document for a brand-new task (version 1, effective today). */
export function newTaskVersion(
  def: TaskDefinition,
  opts: { taskId: string; effectiveFrom: DateString; createdBy: string; replaces?: string | null },
): VersionWrite {
  return clean({
    ...def,
    target: def.target ?? null,
    activeDays: def.cadence === 'daily' ? def.activeDays : null,
    taskId: opts.taskId,
    version: 1,
    prevVersionId: null,
    replaces: opts.replaces ?? null,
    effectiveFrom: opts.effectiveFrom,
    effectiveTo: null,
    fieldKeys: def.fields.map((f) => f.key),
    fieldTypes: fieldTypesOf(def.fields),
    snapshot: snapshotOf(def),
    createdBy: opts.createdBy,
  })
}

/** Build the next version after a measured change. The previous version is closed the day before. */
export function nextTaskVersion(
  prev: TaskVersionDoc,
  def: TaskDefinition,
  opts: { effectiveFrom: DateString; createdBy: string; lineage: Record<string, string> },
): { version: VersionWrite; closePrev: { effectiveTo: string } } {
  return {
    version: clean({
      ...def,
      target: def.target ?? null,
      activeDays: def.cadence === 'daily' ? def.activeDays : null,
      taskId: prev.taskId,
      version: prev.version + 1,
      prevVersionId: prev.id,
      replaces: prev.replaces ?? null,
      effectiveFrom: opts.effectiveFrom,
      effectiveTo: null,
      fieldKeys: def.fields.map((f) => f.key),
      fieldTypes: fieldTypesOf(def.fields, opts.lineage),
      snapshot: snapshotOf(def),
      createdBy: opts.createdBy,
    }),
    closePrev: { effectiveTo: shiftDays(opts.effectiveFrom, -1) },
  }
}

/** The patch for a cosmetic edit applied in place. */
export function cosmeticPatch(def: TaskDefinition): Partial<TaskVersionDoc> {
  return clean({
    name: def.name,
    description: def.description ?? '',
    icon: def.icon ?? null,
    sortOrder: def.sortOrder,
    fields: def.fields,
    snapshot: snapshotOf(def),
  }) as Partial<TaskVersionDoc>
}

export function versionInEffect(versions: TaskVersionDoc[], taskId: string, date: DateString): TaskVersionDoc | null {
  return (
    versions.find(
      (v) => v.taskId === taskId && v.effectiveFrom <= date && (v.effectiveTo === null || v.effectiveTo >= date),
    ) ?? null
  )
}

/** One version per task in effect on `date`, in sort order. */
export function versionsInEffect(versions: TaskVersionDoc[], date: DateString): TaskVersionDoc[] {
  const byTask = new Map<string, TaskVersionDoc>()
  for (const v of versions) {
    if (v.effectiveFrom <= date && (v.effectiveTo === null || v.effectiveTo >= date)) byTask.set(v.taskId, v)
  }
  return [...byTask.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** The latest version of each task, including retired ones. */
export function latestVersions(versions: TaskVersionDoc[]): TaskVersionDoc[] {
  const byTask = new Map<string, TaskVersionDoc>()
  for (const v of versions) {
    const cur = byTask.get(v.taskId)
    if (!cur || v.version > cur.version) byTask.set(v.taskId, v)
  }
  return [...byTask.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function definitionOf(v: TaskVersionDoc): TaskDefinition {
  return clean({
    name: v.name,
    description: v.description,
    icon: v.icon,
    sortOrder: v.sortOrder,
    cadence: v.cadence,
    activeDays: v.activeDays,
    requiredCount: v.requiredCount,
    completionType: v.completionType,
    fields: v.fields,
    target: v.target ?? undefined,
  })
}

export function isRetired(v: TaskVersionDoc, today: DateString): boolean {
  return v.effectiveTo !== null && v.effectiveTo < today
}
