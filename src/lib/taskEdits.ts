import type { TaskDefinition, TaskField } from '@/types/task'
import { hasValue, roundToStep } from './completionStatus'

export type EditClass = 'none' | 'cosmetic' | 'measured' | 'refused'

export interface EditClassification {
  class: EditClass
  /** Human-readable reasons, most severe class first. */
  reasons: string[]
}

/** type|unit signature of a field; the part that is locked for a task's lifetime. */
export function fieldSignature(f: Pick<TaskField, 'type' | 'unit'>): string {
  return `${f.type}|${f.unit ?? ''}`
}

const COSMETIC_KEYS = ['name', 'description', 'icon', 'sortOrder'] as const
const MEASURED_FIELD_KEYS = ['required', 'min', 'max', 'step', 'options'] as const

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Classify an edit from `prev` to `next`.
 *
 * `lineageSignatures` is the type|unit signature of every field key that has ever existed
 * on this task (any version). It catches re-adding a removed key with a different type or unit.
 */
export function classifyEdit(
  prev: TaskDefinition,
  next: TaskDefinition,
  lineageSignatures: Record<string, string> = {},
): EditClassification {
  const refused: string[] = []
  const measured: string[] = []
  const cosmetic: string[] = []

  const prevFields = new Map(prev.fields.map((f) => [f.key, f]))
  const nextFields = new Map(next.fields.map((f) => [f.key, f]))
  const knownSignatures = { ...lineageSignatures }
  for (const f of prev.fields) knownSignatures[f.key] = fieldSignature(f)

  for (const [key, nf] of nextFields) {
    const known = knownSignatures[key]
    if (known !== undefined && known !== fieldSignature(nf)) {
      refused.push(`Field "${key}" cannot change type or unit (${known} → ${fieldSignature(nf)})`)
    }
  }

  for (const k of COSMETIC_KEYS) {
    if (!same(prev[k], next[k])) cosmetic.push(`${k} changed`)
  }

  if (prev.cadence !== next.cadence) measured.push(`cadence ${prev.cadence} → ${next.cadence}`)
  if (!same(prev.activeDays, next.activeDays)) measured.push('active days changed')
  if (prev.requiredCount !== next.requiredCount)
    measured.push(`required count ${prev.requiredCount} → ${next.requiredCount}`)
  if (prev.completionType !== next.completionType)
    measured.push(`completion type ${prev.completionType} → ${next.completionType}`)

  for (const key of prevFields.keys()) {
    if (!nextFields.has(key)) measured.push(`field "${key}" removed`)
  }
  for (const [key, nf] of nextFields) {
    const pf = prevFields.get(key)
    if (!pf) {
      measured.push(`field "${key}" added`)
      continue
    }
    if (pf.label !== nf.label) cosmetic.push(`field "${key}" label changed`)
    // A default only changes what new entries start with, never how a period is judged.
    if (!same(pf.default, nf.default)) cosmetic.push(`field "${key}" default changed`)
    for (const k of MEASURED_FIELD_KEYS) {
      if (!same(pf[k], nf[k])) measured.push(`field "${key}" ${k} changed`)
    }
  }

  if (refused.length) return { class: 'refused', reasons: [...refused, ...measured, ...cosmetic] }
  if (measured.length) return { class: 'measured', reasons: [...measured, ...cosmetic] }
  if (cosmetic.length) return { class: 'cosmetic', reasons: cosmetic }
  return { class: 'none', reasons: [] }
}

/** Validation independent of any previous version. */
export function validateDefinition(def: TaskDefinition): string[] {
  const errors: string[] = []
  if (!def.name.trim()) errors.push('Name is required')
  if (def.requiredCount < 1 || !Number.isInteger(def.requiredCount))
    errors.push('Required count must be a whole number of at least 1')
  if (def.cadence !== 'daily' && def.activeDays !== null)
    errors.push('Active days apply to daily tasks only')
  if (def.activeDays !== null && def.activeDays.length === 0)
    errors.push('A daily task must be active on at least one day')
  if (def.completionType === 'checkbox' && def.fields.length > 0)
    errors.push('A checkbox task has no fields')
  if (def.completionType === 'fields' && def.fields.length === 0)
    errors.push('A fields task needs at least one field')

  const keys = new Set<string>()
  for (const f of def.fields) {
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(f.key)) errors.push(`Field key "${f.key}" must be camelCase`)
    if (keys.has(f.key)) errors.push(`Duplicate field key "${f.key}"`)
    keys.add(f.key)
    if (f.type === 'select' && (!f.options || f.options.length === 0))
      errors.push(`Field "${f.key}" needs options`)
    if (f.min !== undefined && f.max !== undefined && f.min > f.max)
      errors.push(`Field "${f.key}" min is greater than max`)
    if (f.step !== undefined && !(f.step > 0)) errors.push(`Field "${f.key}" must round to a number above 0`)
    errors.push(...defaultErrors(f))
  }
  return errors
}

/** A default must be a valid value for its field, and one that counts, so a one-tap log always counts. */
function defaultErrors(f: TaskField): string[] {
  const d = f.default
  if (!hasValue(d)) return []
  const name = f.label || f.key
  switch (f.type) {
    case 'number':
    case 'duration':
      if (typeof d !== 'number') return [`${name}'s default must be a ${f.type === 'number' ? 'number' : 'duration'}`]
      if ((f.min !== undefined && d < f.min) || (f.max !== undefined && d > f.max)) return [`${name}'s default must be within its min and max`]
      if (f.type === 'number' && f.step !== undefined && f.step > 0 && roundToStep(d, f.step) !== d)
        return [`${name}'s default must be a multiple of ${f.step}`]
      return []
    case 'boolean':
      return typeof d === 'boolean' ? [] : [`${name}'s default must be yes or no`]
    case 'select':
      return f.options?.includes(d as string) ? [] : [`${name}'s default must be one of its choices`]
    case 'text':
      return typeof d === 'string' ? [] : [`${name}'s default must be text`]
  }
}
