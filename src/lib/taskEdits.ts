import type { TaskDefinition, TaskField, TaskTarget } from '@/types/task'

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
const MEASURED_FIELD_KEYS = ['required', 'min', 'max', 'step', 'options', 'default'] as const

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
  if (!same(prev.target, next.target)) measured.push('target changed')

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
  }

  if (def.target) {
    const tf = def.fields.find((f) => f.key === def.target!.fieldKey)
    if (!tf) errors.push(`Target refers to unknown field "${def.target.fieldKey}"`)
    else {
      if (tf.type !== 'number' && tf.type !== 'duration')
        errors.push('Target field must be a number or duration')
      if (!tf.required) errors.push('A goal must be on a required field')
      if (!goalFitsRange(def.target, tf.min, tf.max)) errors.push(`The goal must fall within ${tf.label || tf.key}'s min and max`)
    }
    if (def.target.comparator === 'between' && def.target.valueMax === undefined)
      errors.push('A "between" target needs valueMax')
    else if (def.target.comparator === 'between' && def.target.valueMax! < def.target.value)
      errors.push('A "between" goal needs its first value to be the smaller one')
  }
  return errors
}

/**
 * Whether a goal can be met by a value inside the field's min and max. "At least" and "exactly"
 * goals also become the one-tap default, so the goal amount itself must be in range.
 */
function goalFitsRange(t: TaskTarget, min = -Infinity, max = Infinity): boolean {
  switch (t.comparator) {
    case '>=':
    case '==':
      return t.value >= min && t.value <= max
    case '<=':
      return t.value >= min
    case 'between':
      return t.value <= max && (t.valueMax ?? t.value) >= min
  }
}
